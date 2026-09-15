import { describe, expect, it } from "bun:test";
import { parseLocale } from "../lib/i18n/locale";

describe("parseLocale", () => {
	it("is English without RELOOP_GERMAN, whatever the cookie says", () => {
		expect(parseLocale("de", false)).toBe("en");
		expect(parseLocale("en", false)).toBe("en");
		expect(parseLocale(undefined, false)).toBe("en");
	});

	it("honours a German cookie only when German is offered", () => {
		expect(parseLocale("de", true)).toBe("de");
		expect(parseLocale("en", true)).toBe("en");
		expect(parseLocale(null, true)).toBe("en");
		expect(parseLocale("fr", true)).toBe("en");
	});
});
