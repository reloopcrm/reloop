import { afterEach, describe, expect, it } from "bun:test";
import { marketingUrl, signInUrl, signUpUrl } from "./site-links";

const saved = {
	cloud: process.env.RELOOP_CLOUD_URL,
	site: process.env.RELOOP_SITE_URL,
};

function restore(name: "RELOOP_CLOUD_URL" | "RELOOP_SITE_URL", value?: string) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

afterEach(() => {
	restore("RELOOP_CLOUD_URL", saved.cloud);
	restore("RELOOP_SITE_URL", saved.site);
});

describe("signUpUrl", () => {
	it("stays on this site without a cloud address", () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(signUpUrl()).toBe("/get-started");
		expect(signUpUrl("start")).toBe("/get-started?plan=start");
	});

	it("treats an empty value as unset", () => {
		process.env.RELOOP_CLOUD_URL = "";

		expect(signUpUrl("start")).toBe("/get-started?plan=start");
	});

	it("points at the cloud when the address is set", () => {
		process.env.RELOOP_CLOUD_URL = "https://app.reloopcrm.com/";

		expect(signUpUrl()).toBe("https://app.reloopcrm.com/get-started");
		expect(signUpUrl("plus")).toBe(
			"https://app.reloopcrm.com/get-started?plan=plus",
		);
	});
});

describe("marketingUrl", () => {
	it("stays on this site without a site address", () => {
		delete process.env.RELOOP_SITE_URL;

		expect(marketingUrl("/pricing")).toBe("/pricing");
	});

	it("treats an empty value as unset", () => {
		process.env.RELOOP_SITE_URL = "";

		expect(marketingUrl("/about")).toBe("/about");
	});

	it("points at the marketing site when the address is set", () => {
		process.env.RELOOP_SITE_URL = "https://reloopcrm.com/";

		expect(marketingUrl("/pricing")).toBe("https://reloopcrm.com/pricing");
		expect(marketingUrl("/vs/hubspot")).toBe(
			"https://reloopcrm.com/vs/hubspot",
		);
	});
});

describe("signInUrl", () => {
	it("stays on this site without a cloud address", () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(signInUrl()).toBe("/sign-in");
	});

	it("sends visitors to the cloud sign-in when the address is set", () => {
		process.env.RELOOP_CLOUD_URL = "https://app.reloopcrm.com/";

		expect(signInUrl()).toBe("https://app.reloopcrm.com/sign-in");
	});
});
