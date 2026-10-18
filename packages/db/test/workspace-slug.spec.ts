import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { CLOUD_RESERVED_SLUGS } from "../src/cloud/slugs.data";
import {
	DEFAULT_WORKSPACE_SLUG,
	isUsableSlug,
	MAX_SLUG,
	RESERVED_SLUGS,
	workspaceSlug,
} from "../src/workspace";

describe("workspaceSlug", () => {
	it("is the company name a rep can read in the address bar", () => {
		expect(workspaceSlug("Reloop")).toBe("reloop");
		expect(workspaceSlug("Acme")).toBe("acme");
		expect(workspaceSlug("Northwind Savings Group")).toBe(
			"northwind-savings-group",
		);
	});

	it("keeps the punctuation out of the URL rather than escaping it", () => {
		expect(workspaceSlug("  Fernhill & Co.  ")).toBe("fernhill-co");
		expect(workspaceSlug("Reply.io")).toBe("reply-io");
		expect(workspaceSlug("Zoë Söderberg AB")).toBe("zoe-soderberg-ab");
	});

	it("never collides with a route the app already serves", () => {
		for (const reserved of RESERVED_SLUGS) {
			expect(workspaceSlug(reserved)).not.toBe(reserved);
		}

		expect(workspaceSlug("Settings")).toBe("settings-crm");
		expect(workspaceSlug("Sign In")).toBe("sign-in-crm");
		expect(workspaceSlug("Docs")).toBe("docs-crm");
		expect(workspaceSlug("Win Back")).toBe("win-back-crm");
		expect(workspaceSlug("T")).toBe("t-crm");
	});

	it("falls back rather than producing an empty segment", () => {
		expect(workspaceSlug("")).toBe(DEFAULT_WORKSPACE_SLUG);
		expect(workspaceSlug("   ")).toBe(DEFAULT_WORKSPACE_SLUG);
		expect(workspaceSlug("——")).toBe(DEFAULT_WORKSPACE_SLUG);
		expect(workspaceSlug("株式会社")).toBe(DEFAULT_WORKSPACE_SLUG);
	});

	it("is bounded, and never ends on the dash the cut left behind", () => {
		const slug = workspaceSlug(`${"a".repeat(MAX_SLUG)} Holdings`);

		expect(slug).toHaveLength(MAX_SLUG);
		expect(slug.endsWith("-")).toBe(false);
	});

	it("gives one name one answer, whoever asks", () => {
		expect(workspaceSlug("Reloop CRM")).toBe(workspaceSlug("reloop  crm"));
	});
});

describe("isUsableSlug", () => {
	it("accepts a custom slug and rejects an empty or reserved one", () => {
		expect(isUsableSlug("acme-eu")).toBe(true);
		expect(isUsableSlug("")).toBe(false);

		for (const reserved of RESERVED_SLUGS) {
			expect(isUsableSlug(reserved)).toBe(false);
		}
	});
});

describe("the cloud slug slot", () => {
	it("reserves every slug the hosted build adds", () => {
		for (const reserved of CLOUD_RESERVED_SLUGS) {
			expect(RESERVED_SLUGS).toContain(reserved);
			expect(isUsableSlug(reserved)).toBe(false);
			expect(workspaceSlug(reserved)).not.toBe(reserved);
		}
	});

	it("stays plain data, because a client component imports the slug helpers", () => {
		const source = readFileSync(
			new URL("../src/cloud/slugs.data.ts", import.meta.url),
			"utf8",
		);

		expect(source).not.toMatch(/^\s*import\s/m);
		expect(source).not.toMatch(/\bimport\(/);
	});
});
