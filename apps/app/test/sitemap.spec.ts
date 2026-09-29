import { afterEach, describe, expect, it } from "bun:test";
import sitemap from "../app/sitemap";
import { MARKETING_ROUTES, MARKETING_SITEMAP } from "../cloud/slots.data";
import { PRICING } from "../components/signup/config";

const MARKETING = [...MARKETING_SITEMAP.lead, ...MARKETING_SITEMAP.rest];

const saved = {
	app: process.env.APP_URL,
	cloud: process.env.RELOOP_CLOUD_URL,
};

afterEach(() => {
	if (saved.app === undefined) delete process.env.APP_URL;
	else process.env.APP_URL = saved.app;
	if (saved.cloud === undefined) delete process.env.RELOOP_CLOUD_URL;
	else process.env.RELOOP_CLOUD_URL = saved.cloud;
});

function paths(): string[] {
	process.env.APP_URL = "https://reloopcrm.com";
	return sitemap().map((entry) => new URL(entry.url).pathname);
}

describe("sitemap.xml", () => {
	it("lists the sign-up page when the cloud is this site and the build has one", () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(paths().includes(PRICING.href.start)).toBe(
			MARKETING.includes(PRICING.href.start),
		);
		expect(paths()).toEqual(expect.arrayContaining(MARKETING));
	});

	it("leaves the sign-up page out when it only redirects", () => {
		process.env.RELOOP_CLOUD_URL = "https://app.reloopcrm.com";

		expect(paths()).not.toContain("/get-started");
		expect(paths()).toEqual(expect.arrayContaining(MARKETING));
	});

	it("lists the landing page only when the build carries one", () => {
		expect(paths().includes("/")).toBe(MARKETING_ROUTES.length > 0);
	});

	it("leaves privacy and contact out, since they can carry an operator's name", () => {
		expect(paths()).not.toContain("/privacy");
		expect(paths()).not.toContain("/contact");
	});
});
