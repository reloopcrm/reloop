import { afterEach, describe, expect, it } from "bun:test";
import sitemap from "../app/sitemap";

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
	it("lists the sign-up page when the cloud is this site", () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(paths()).toContain("/get-started");
		expect(paths()).toContain("/pricing");
	});

	it("leaves the sign-up page out when it only redirects", () => {
		process.env.RELOOP_CLOUD_URL = "https://app.reloopcrm.com";

		expect(paths()).not.toContain("/get-started");
		expect(paths()).toContain("/pricing");
	});
});
