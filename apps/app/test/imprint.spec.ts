import { afterEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sitemap from "../app/sitemap";
import { getImprint, IMPRINT_ROBOTS } from "../lib/imprint";
import { PROXY } from "../lib/proxy-config";

const IMPRINT_KEYS = [
	"RELOOP_IMPRINT_NAME",
	"RELOOP_IMPRINT_BUSINESS",
	"RELOOP_IMPRINT_ADDRESS",
	"RELOOP_IMPRINT_EMAIL",
	"RELOOP_IMPRINT_VAT_ID",
	"RELOOP_IMPRINT_PHONE",
] as const;

function clearImprintEnv() {
	for (const key of IMPRINT_KEYS) delete process.env[key];
}

afterEach(clearImprintEnv);

describe("getImprint", () => {
	it("is null with nothing set, so the page and the footer link do not exist", () => {
		clearImprintEnv();
		expect(getImprint()).toBeNull();
	});

	it("is null when only the other fields are set, without a name", () => {
		clearImprintEnv();
		process.env.RELOOP_IMPRINT_EMAIL = "info@example.com";
		expect(getImprint()).toBeNull();
	});

	it("reads every field once a name is set", () => {
		clearImprintEnv();
		process.env.RELOOP_IMPRINT_NAME = "Max Mustermann";
		process.env.RELOOP_IMPRINT_BUSINESS = "Beispiel GmbH";
		process.env.RELOOP_IMPRINT_ADDRESS = "Musterstraße 1;12345 Musterstadt";
		process.env.RELOOP_IMPRINT_EMAIL = "info@example.com";
		process.env.RELOOP_IMPRINT_VAT_ID = "DE000000000";
		process.env.RELOOP_IMPRINT_PHONE = "+49 30 000000";

		expect(getImprint()).toEqual({
			name: "Max Mustermann",
			business: "Beispiel GmbH",
			addressLines: ["Musterstraße 1", "12345 Musterstadt"],
			email: "info@example.com",
			vatId: "DE000000000",
			phone: "+49 30 000000",
		});
	});

	it("splits the address on a real newline too", () => {
		clearImprintEnv();
		process.env.RELOOP_IMPRINT_NAME = "Max Mustermann";
		process.env.RELOOP_IMPRINT_ADDRESS = "Musterstraße 1\n12345 Musterstadt";

		expect(getImprint()?.addressLines).toEqual([
			"Musterstraße 1",
			"12345 Musterstadt",
		]);
	});

	it("drops every optional field that is unset, instead of throwing", () => {
		clearImprintEnv();
		process.env.RELOOP_IMPRINT_NAME = "Max Mustermann";

		expect(getImprint()).toEqual({
			name: "Max Mustermann",
			business: null,
			addressLines: [],
			email: null,
			vatId: null,
			phone: null,
		});
	});

	it("drops an empty or oversized value instead of throwing", () => {
		clearImprintEnv();
		process.env.RELOOP_IMPRINT_NAME = "   ";
		expect(getImprint()).toBeNull();

		process.env.RELOOP_IMPRINT_NAME = "Max Mustermann";
		process.env.RELOOP_IMPRINT_VAT_ID = "x".repeat(500);
		expect(getImprint()?.vatId).toBeNull();
	});
});

describe("the imprint page", () => {
	const root = join(import.meta.dir, "..");

	it("is reachable only where the marketing pages are", () => {
		expect(PROXY.marketing).toContain("/imprint");
	});

	it("carries the noindex metadata and 404s without a configured name", async () => {
		const source = await readFile(
			join(root, "app/(landing)/imprint/page.tsx"),
			"utf8",
		);

		expect(source).toContain("robots: IMPRINT_ROBOTS");
		expect(source).toContain("if (!imprint) notFound();");
	});

	it("keeps IMPRINT_ROBOTS out of search results but still crawlable", () => {
		expect(IMPRINT_ROBOTS).toEqual({ index: false, follow: true });
	});

	it("stays out of the sitemap, noindex or not", () => {
		const urls = sitemap().map((entry) => entry.url);
		expect(urls.some((url) => url.endsWith("/imprint"))).toBe(false);
	});
});

describe("privacy and contact", () => {
	const root = join(import.meta.dir, "..");

	it("carry the noindex metadata, since they can show the operator's name", async () => {
		for (const file of [
			"app/(landing)/privacy/page.tsx",
			"app/(landing)/contact/page.tsx",
		]) {
			const source = await readFile(join(root, file), "utf8");
			expect(source, file).toContain("robots: IMPRINT_ROBOTS");
		}
	});

	it("stay out of the sitemap, noindex or not", () => {
		const urls = sitemap().map((entry) => entry.url);
		expect(urls.some((url) => url.endsWith("/privacy"))).toBe(false);
		expect(urls.some((url) => url.endsWith("/contact"))).toBe(false);
	});

	it("hold no {{placeholder}} anywhere in their source", async () => {
		for (const file of [
			"app/(landing)/privacy/page.tsx",
			"app/(landing)/contact/page.tsx",
		]) {
			const source = await readFile(join(root, file), "utf8");
			expect(source, file).not.toContain("{{");
		}
	});
});

describe("the footer link", () => {
	it("only appears once an imprint is configured", async () => {
		const source = await readFile(
			join(import.meta.dir, "..", "components/landing/landing-shell.tsx"),
			"utf8",
		);

		expect(source).toContain("getImprint()");
		expect(source).toContain('marketingUrl("/imprint")');
	});
});
