import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	COMPANY_BRAND,
	capabilitiesFrom,
	enabled,
	markdownFor,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = ["PERPLEXITY_API_KEY", "BLOB_READ_WRITE_TOKEN"] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("capabilities", () => {
	it("reports every key-bound source off on a bare install", async () => {
		const keyless = capabilitiesFrom().filter((c) => c.id !== COMPANY_BRAND);

		expect(keyless.every((c) => !c.enabled)).toBe(true);
		expect(await enabled("PERPLEXITY_API_KEY")).toBe(false);
	});

	it("keeps company brand data on, because it reads the website", () => {
		expect(
			capabilitiesFrom().find((c) => c.id === COMPANY_BRAND)?.enabled,
		).toBe(true);
	});

	it("turns one on without turning on the others", async () => {
		process.env.PERPLEXITY_API_KEY = "pplx-test";

		expect(await enabled("PERPLEXITY_API_KEY")).toBe(true);
		expect(await enabled("BLOB_READ_WRITE_TOKEN")).toBe(false);
	});

	it("treats blank and whitespace as unset", async () => {
		process.env.PERPLEXITY_API_KEY = "   ";
		expect(await enabled("PERPLEXITY_API_KEY")).toBe(false);
	});

	it("is read live, so a late-configured process is not stuck off", async () => {
		expect(await enabled("PERPLEXITY_API_KEY")).toBe(false);
		process.env.PERPLEXITY_API_KEY = "key";
		expect(await enabled("PERPLEXITY_API_KEY")).toBe(true);
	});

	it("is unknown for a variable that is not a capability", async () => {
		process.env.SOMETHING_ELSE = "x";
		expect(await enabled("SOMETHING_ELSE")).toBe(false);
		delete process.env.SOMETHING_ELSE;
	});
});

describe("no capability asks for a paid research key any more", () => {
	it("names no vendor key and no settings page", () => {
		for (const capability of capabilitiesFrom()) {
			expect(capability.id).not.toContain("CONTEXT");
			expect(capability.from).not.toContain("Settings");
		}
	});

	it("offers no LinkedIn source", () => {
		expect(capabilitiesFrom().some((c) => c.label.includes("LinkedIn"))).toBe(
			false,
		);
		expect(markdownFor(capabilitiesFrom())).not.toContain("LinkedIn");
	});

	it("reads no environment variable for it either", async () => {
		process.env.CONTEXT_DEV_API_KEY = "a-variable-nothing-reads";

		expect(capabilitiesFrom().some((c) => c.id === "CONTEXT_DEV_PEOPLE")).toBe(
			false,
		);

		delete process.env.CONTEXT_DEV_API_KEY;
	});
});

describe("the unavailable result", () => {
	it("says retrying will not help", () => {
		const result = unavailable("PERPLEXITY_API_KEY");

		expect(result.ok).toBe(false);
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("retrying will not help");
		expect(result.reason).toContain("PERPLEXITY_API_KEY");
	});
});

describe("the capability briefing", () => {
	it("tells an install with no source at all to work from the CRM alone", () => {
		const markdown = markdownFor([]);

		expect(markdown).toContain("No outside sources are configured");
		expect(markdown).toContain("read_crm_history");
	});

	it("offers the website reader to a bare install", () => {
		const markdown = markdownFor(capabilitiesFrom());

		expect(markdown).toContain("Available:");
		expect(markdown).toContain("Company brand data");
		expect(markdown).toContain("its own website");
	});

	it("lists what is on and what is off, separately", () => {
		const markdown = markdownFor(capabilitiesFrom());

		expect(markdown).toContain("Available:");
		expect(markdown).toContain("Not configured here");
		expect(markdown).toContain("Web research");
	});

	it("does not warn about missing sources when everything is on", () => {
		for (const key of KEYS) process.env[key] = "key";

		expect(markdownFor(capabilitiesFrom())).not.toContain(
			"Not configured here",
		);
	});
});
