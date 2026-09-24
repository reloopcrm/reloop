import { describe, expect, it } from "bun:test";
import {
	importLanguage,
	parseArgs,
	USAGE,
} from "../scripts/import-single-tenant";
import { parseArgs as parseTenantArgs } from "../scripts/tenant";

describe("the import command line", () => {
	it("reads the dump, the tenant, the slug and the sign-in list", () => {
		expect(
			parseArgs([
				"--dump",
				"/tmp/reloop.sql",
				"--tenant",
				"acme",
				"--slug",
				"acme-gmbh",
				"--sign-in",
				"Owner@Acme.example, @acme.example",
				"--dry-run",
			]),
		).toEqual({
			dump: "/tmp/reloop.sql",
			tenant: "acme",
			slug: "acme-gmbh",
			signIn: ["owner@acme.example", "acme.example"],
			language: null,
			dryRun: true,
		});
	});

	it("refuses a missing value, an unknown flag and the old secret as a flag", () => {
		const base = ["--dump", "a.sql", "--tenant", "acme", "--slug", "acme"];
		expect(() => parseArgs(base)).toThrow(USAGE);
		expect(() =>
			parseArgs([...base, "--sign-in", "a@b.example", "--old-secret", "x"]),
		).toThrow(USAGE);
		expect(() => parseArgs([...base, "--sign-in"])).toThrow(USAGE);
	});

	it("takes --language, refuses a language the app does not have", () => {
		const base = [
			"--dump",
			"a.sql",
			"--tenant",
			"acme",
			"--slug",
			"acme",
			"--sign-in",
			"acme.example",
		];
		expect(parseArgs([...base, "--language", "de"]).language).toBe("de");
		expect(() => parseArgs([...base, "--language", "xx"])).toThrow(
			"--language takes one of",
		);
	});

	it("picks the flag, then the stored value, then the old install's RELOOP_GERMAN", () => {
		expect(importLanguage("fr", "es", "true")).toBe("fr");
		expect(importLanguage(null, "es", "true")).toBe("es");
		expect(importLanguage(null, null, "true")).toBe("de");
		expect(importLanguage(null, null, undefined)).toBe("en");
		expect(importLanguage(null, null, "false")).toBe("en");
	});
});

describe("the tenant command line", () => {
	it("creates with --language, or with the RELOOP_GERMAN default", () => {
		const create = ["create", "acme", "acme.example"];
		expect(parseTenantArgs([...create, "--language", "tr"], {})).toMatchObject({
			name: "create",
			id: "acme",
			entry: "acme.example",
			language: "tr",
		});
		expect(parseTenantArgs(create, { RELOOP_GERMAN: "true" })).toMatchObject({
			language: "de",
		});
		expect(parseTenantArgs(create, {})).toMatchObject({ language: "en" });
		expect(() =>
			parseTenantArgs([...create, "--language", "klingon"], {}),
		).toThrow("--language takes one of");
	});
});
