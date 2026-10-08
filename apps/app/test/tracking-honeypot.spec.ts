import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { HONEYPOT_FIELD, type TrackingConfig } from "@crm/db/tracking";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { trackerSource } from "@/lib/tracking/tracker";

GlobalRegistrator.register({ url: "https://www.reloop.de/contact" });

const CONFIG: TrackingConfig = {
	siteId: "cmp_8f3ad91c",
	crossDomain: false,
	limitToDomains: true,
	cookieSubdomains: false,
	secureCookies: true,
	honourDnt: false,
	cookieDays: 395,
	hosts: [{ host: "reloop.de", scope: "SITE_AND_SUBDOMAINS" }],
};

type Sent = { type: string; fields?: Record<string, string> };

const beacons: Blob[] = [];

async function submissions(): Promise<Sent[]> {
	const bodies = await Promise.all(beacons.map((blob) => blob.text()));

	return bodies
		.flatMap((body) => (JSON.parse(body) as { events: Sent[] }).events)
		.filter((event) => event.type === "form_submit");
}

function form(id: string): HTMLFormElement {
	const element = document.createElement("form");
	element.id = id;
	const email = document.createElement("input");
	email.name = "email";
	element.appendChild(email);
	document.body.appendChild(element);

	return element;
}

function submit(element: HTMLFormElement) {
	element.dispatchEvent(
		new Event("submit", { bubbles: true, cancelable: true }),
	);
}

function trapOf(element: HTMLFormElement): HTMLInputElement | null {
	return element.querySelector<HTMLInputElement>("[data-crm-hp]");
}

let human: HTMLFormElement;
let bot: HTMLFormElement;

beforeAll(async () => {
	Object.defineProperty(navigator, "webdriver", {
		configurable: true,
		value: false,
	});
	Object.defineProperty(navigator, "sendBeacon", {
		configurable: true,
		value: (_url: string, body: Blob) => {
			beacons.push(body);
			return true;
		},
	});

	human = form("human");
	bot = form("bot");

	new Function(trackerSource(CONFIG, "https://crm.example.com/api/t/e"))();

	for (let tries = 0; tries < 100 && !trapOf(bot); tries += 1) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
});

afterAll(() => GlobalRegistrator.unregister());

describe("the honeypot the tracker puts in every form", () => {
	test("adds one hidden trap field to each form on the page", () => {
		expect(trapOf(human)).not.toBeNull();
		expect(trapOf(bot)).not.toBeNull();
		expect(human.querySelectorAll("[data-crm-hp]")).toHaveLength(1);
	});

	test("gives the trap no name, so the site's own form never posts it", () => {
		const trap = trapOf(human);

		expect(trap?.getAttribute("name")).toBeNull();
		expect(trap?.tabIndex).toBe(-1);
		expect(trap?.getAttribute("aria-hidden")).toBe("true");
	});

	test("sends a person's submission without the trap", async () => {
		beacons.length = 0;
		const email = human.querySelector<HTMLInputElement>("input[name=email]");
		if (email) email.value = "preview@example.com";

		submit(human);

		const sent = await submissions();
		expect(sent).toHaveLength(1);
		expect(sent[0]?.fields).toEqual({ email: "preview@example.com" });
	});

	test("marks a submission whose trap was filled in", async () => {
		beacons.length = 0;
		const email = bot.querySelector<HTMLInputElement>("input[name=email]");
		if (email) email.value = "preview@example.com";
		const trap = trapOf(bot);
		if (trap) trap.value = "https://spam.example.com";

		submit(bot);

		const sent = await submissions();
		expect(sent).toHaveLength(1);
		expect(sent[0]?.fields?.[HONEYPOT_FIELD]).toBe("1");
	});
});
