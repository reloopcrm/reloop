import { describe, expect, it } from "bun:test";
import { LOCALES } from "@crm/db/locale";
import { parseLocale } from "../lib/i18n/locale";

describe("parseLocale", () => {
	it("takes every language the app ships", () => {
		for (const locale of LOCALES) expect(parseLocale(locale)).toBe(locale);
	});

	it("falls back to English on anything else", () => {
		expect(parseLocale("fr-CA")).toBe("en");
		expect(parseLocale("klingon")).toBe("en");
		expect(parseLocale("")).toBe("en");
		expect(parseLocale(null)).toBe("en");
		expect(parseLocale(undefined)).toBe("en");
	});
});
