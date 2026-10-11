import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type {
	CapacityLine,
	UsageLine,
} from "../app/(app)/[slug]/settings/ai/usage";
import { meterShare, meterTone } from "../lib/usage-meter";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { Usage } = await import("../app/(app)/[slug]/settings/ai/usage");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");

afterAll(() => {
	GlobalRegistrator.unregister();
});

const CAPACITY = [
	{
		counter: "contacts",
		used: 43,
		limit: 100,
		included: true,
		level: "normal",
	},
	{
		counter: "mailboxes",
		used: 1,
		limit: 1,
		included: true,
		level: "reached",
	},
] as const;

const LINES = [
	{
		counter: "insights",
		used: 850,
		limit: 1000,
		included: true,
		level: "warning",
	},
	{
		counter: "sessions",
		used: 3,
		limit: 100,
		included: true,
		level: "normal",
	},
	{
		counter: "research",
		used: 0,
		limit: null,
		included: false,
		level: "normal",
	},
	{
		counter: "chat",
		used: 7,
		limit: null,
		included: true,
		level: "normal",
	},
] as const;

function shownValue(markup: string, counter: string): string {
	const open = new RegExp(`<span[^>]*data-usage="${counter}"[^>]*>`).exec(
		markup,
	);
	if (!open) return "";
	let depth = 1;
	let text = "";
	const tags = /<\/?span[^>]*>|[^<]+/g;
	tags.lastIndex = open.index + open[0].length;
	for (
		let token = tags.exec(markup);
		token && depth > 0;
		token = tags.exec(markup)
	) {
		const piece = token[0];
		if (piece.startsWith("</span")) depth -= 1;
		else if (piece.startsWith("<span")) depth += 1;
		else text += piece;
	}
	return text;
}

function toneOf(markup: string, label: string): string | null {
	const match = new RegExp(
		`data-tone="([a-z]+)"[^>]*aria-label="${label}"`,
	).exec(markup);
	return match?.[1] ?? null;
}

describe("the usage meters", () => {
	const markup = renderToStaticMarkup(
		createElement(I18nProvider, {
			locale: "en",
			children: createElement(Usage, {
				label: "Trial",
				capacity: [...CAPACITY],
				lines: [...LINES],
				resetsAt: "2026-12-01T00:00:00.000Z",
				trialEnds: false,
			}),
		}),
	);

	it("shows used against the limit with a bar", () => {
		expect(shownValue(markup, "contacts")).toBe("43 / 100");
		expect(toneOf(markup, "Contacts")).toBe("success");
	});

	it("turns to the warning tone near the limit", () => {
		expect(shownValue(markup, "insights")).toBe("850 / 1,000");
		expect(toneOf(markup, "Conversations read")).toBe("warning");
	});

	it("turns to the destructive tone at the limit", () => {
		expect(shownValue(markup, "mailboxes")).toBe("1 / 1");
		expect(toneOf(markup, "Mailboxes")).toBe("destructive");
	});

	it("shows the number and no bar where the plan has no limit", () => {
		expect(shownValue(markup, "chat")).toBe("7, no limit");
		expect(toneOf(markup, "Chat messages")).toBeNull();
	});

	it("says not included where the plan leaves the work out", () => {
		expect(shownValue(markup, "research")).toBe("Not included");
		expect(toneOf(markup, "Company research runs")).toBeNull();
	});

	it("shows no reached warning while no monthly limit is reached", () => {
		expect(markup).not.toContain("A monthly limit is reached");
	});

	it("warns that a monthly limit is almost reached from 80 percent", () => {
		expect(markup).toContain("A monthly limit is almost reached");
		expect(markup).toContain("December 1, 2026");
	});
});

describe("the almost reached warning", () => {
	const render = (lines: UsageLine[], trialEnds = false) =>
		renderToStaticMarkup(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(Usage, {
					label: "Trial",
					capacity: [...CAPACITY],
					lines,
					resetsAt: "2026-11-11T12:00:00.000Z",
					trialEnds,
				}),
			}),
		);

	it("stays away while every monthly line is below 80 percent", () => {
		const markup = render([
			{ ...LINES[0], used: 790, level: "normal" },
			LINES[1],
		]);
		expect(markup).not.toContain("almost reached");
		expect(markup).not.toContain("is reached");
	});

	it("names the trial while a trial limit is almost reached", () => {
		const markup = render([LINES[0]], true);
		expect(markup).toContain("A limit of your trial is almost reached");
		expect(markup).toContain("November 11, 2026");
	});

	it("gives way to the reached warning once a limit is reached", () => {
		const markup = render([
			LINES[0],
			{ ...LINES[1], used: 100, level: "reached" },
		]);
		expect(markup).toContain("A monthly limit is reached");
		expect(markup).not.toContain("almost reached");
	});
});

describe("the limit warning", () => {
	const render = (trialEnds: boolean) =>
		renderToStaticMarkup(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(Usage, {
					label: "Trial",
					capacity: [...CAPACITY],
					lines: [{ ...LINES[0], used: 1000, level: "reached" }],
					resetsAt: "2026-11-11T12:00:00.000Z",
					trialEnds,
				}),
			}),
		);

	it("names the day the trial ends, not next month", () => {
		const markup = render(true);
		expect(markup).toContain("A limit of your trial is reached");
		expect(markup).toContain("November 11, 2026");
		expect(markup).not.toContain("next month");
	});

	it("names the day the month resets on a paid plan", () => {
		const markup = render(false);
		expect(markup).toContain("A monthly limit is reached");
		expect(markup).toContain("November 11, 2026");
		expect(markup).not.toContain("next month");
	});
});

describe("the meter tone", () => {
	it("follows the level of the line", () => {
		expect(meterTone("normal")).toBe("success");
		expect(meterTone("warning")).toBe("warning");
		expect(meterTone("reached")).toBe("destructive");
	});

	it("caps the share at 100", () => {
		expect(meterShare(43, 100)).toBe(43);
		expect(meterShare(140, 100)).toBe(100);
		expect(meterShare(1, 0)).toBe(100);
	});
});

describe("the capacity warning", () => {
	const render = (capacity: CapacityLine[]) =>
		renderToStaticMarkup(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(Usage, {
					label: "Small",
					capacity,
					lines: [],
					resetsAt: "2026-11-11T12:00:00.000Z",
					trialEnds: false,
				}),
			}),
		);

	const contacts = (used: number, level: CapacityLine["level"]) =>
		({
			counter: "contacts",
			used,
			limit: 100,
			included: true,
			level,
		}) satisfies CapacityLine;

	it("stays away at 79 percent of the contact limit", () => {
		const markup = render([contacts(79, "normal")]);
		expect(markup).not.toContain("contact limit");
		expect(markup).not.toContain('role="alert"');
	});

	it("warns at 80 percent of the contact limit without a reset day", () => {
		const markup = render([contacts(80, "warning")]);
		expect(markup).toContain("You have almost reached your contact limit");
		expect(markup).toContain(
			"Upgrade your plan or remove contacts you no longer need.",
		);
		expect(markup).not.toContain("waits until");
		expect(markup).not.toContain("November 11, 2026");
		expect(markup).not.toContain("monthly limit");
	});

	it("shows only the reached message at 100 percent of the contact limit", () => {
		const markup = render([contacts(100, "reached")]);
		expect(markup).toContain("You have reached your contact limit");
		expect(markup).not.toContain("almost reached");
		expect(markup).not.toContain("monthly limit");
	});

	it("names mailboxes for the mailbox limit", () => {
		const markup = render([
			{ ...contacts(10, "normal") },
			{
				counter: "mailboxes",
				used: 4,
				limit: 5,
				included: true,
				level: "warning",
			},
		]);
		expect(markup).toContain("You have almost reached your mailbox limit");
		expect(markup).toContain(
			"Upgrade your plan or disconnect mailboxes you no longer need.",
		);
		expect(markup).not.toContain("contact limit");
	});

	it("shows nothing where the install has no limit", () => {
		const markup = render([
			{ ...contacts(5_000, "normal"), limit: null },
			{
				counter: "mailboxes",
				used: 3,
				limit: null,
				included: true,
				level: "normal",
			},
		]);
		expect(markup).not.toContain("contact limit");
		expect(markup).not.toContain("mailbox limit");
		expect(markup).not.toContain('role="alert"');
	});

	it("reads the German text", () => {
		const markup = renderToStaticMarkup(
			createElement(I18nProvider, {
				locale: "de",
				dictionary: DICTIONARIES.de,
				children: createElement(Usage, {
					label: "Small",
					capacity: [contacts(80, "warning")],
					lines: [],
					resetsAt: "2026-11-11T12:00:00.000Z",
					trialEnds: false,
				}),
			}),
		);
		expect(markup).toContain("Du hast deine Kontaktgrenze fast erreicht");
		expect(markup).not.toContain("You have almost reached");
	});
});
