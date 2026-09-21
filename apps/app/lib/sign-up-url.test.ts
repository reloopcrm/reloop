import { afterEach, describe, expect, it } from "bun:test";
import { signUpUrl } from "./sign-up-url";

const saved = process.env.RELOOP_CLOUD_URL;

afterEach(() => {
	if (saved === undefined) delete process.env.RELOOP_CLOUD_URL;
	else process.env.RELOOP_CLOUD_URL = saved;
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
