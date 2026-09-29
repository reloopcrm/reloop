import { afterEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { HOSTED_ROUTES } from "../cloud/slots.data";
import { PRICING } from "../components/signup/config";
import { markdownLinks } from "../lib/markdown-negotiation";
import { signUpLink } from "../lib/site-links";
import { proxy } from "../proxy";

const CLOUD = "https://app.reloopcrm.com";
const START = PRICING.href.start;
const SERVED_HERE = HOSTED_ROUTES.includes(START);

const saved = {
	cloud: process.env.RELOOP_CLOUD_URL,
	marketing: process.env.IS_MARKETING,
};

afterEach(() => {
	for (const [name, value] of [
		["RELOOP_CLOUD_URL", saved.cloud],
		["IS_MARKETING", saved.marketing],
	] as const) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

async function notFoundMarkdownBody(): Promise<string> {
	process.env.IS_MARKETING = "true";
	const response = await proxy(
		new NextRequest(new URL("/no/such/path", CLOUD), {
			headers: { accept: "text/markdown" },
		}),
	);
	return response.text();
}

describe("the Get started link", () => {
	it("appears only when this build serves the sign-up page itself", () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(signUpLink()).toBe(SERVED_HERE ? START : null);
	});

	it("points at the cloud when the cloud lives elsewhere", () => {
		process.env.RELOOP_CLOUD_URL = CLOUD;

		expect(signUpLink()).toBe(`${CLOUD}${START}`);
	});

	it("is left out of the Markdown links without a sign-up page", () => {
		expect(markdownLinks(null)).not.toContain("Get started");
		expect(markdownLinks(null)).toContain("](/docs)");
		expect(markdownLinks(START)).toContain(`- [Get started](${START})`);
	});

	it("never sends a self-hosted 404 reader to a page that is not there", async () => {
		delete process.env.RELOOP_CLOUD_URL;
		const body = await notFoundMarkdownBody();

		expect(body.includes(START)).toBe(SERVED_HERE);
	});

	it("sends a 404 reader to the cloud when the cloud lives elsewhere", async () => {
		process.env.RELOOP_CLOUD_URL = CLOUD;

		expect(await notFoundMarkdownBody()).toContain(`${CLOUD}${START}`);
	});
});
