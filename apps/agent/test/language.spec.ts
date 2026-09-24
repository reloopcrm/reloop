import { describe, expect, it } from "bun:test";
import { LOCALES } from "@crm/db/locale";
import { parseAgentLanguage } from "@crm/validation/agent-language";
import {
	currentLanguage,
	defaultLanguage,
	language,
	resolveLanguage,
	say,
} from "../agent/lib/language";

const HELLO = {
	en: "Hello",
	de: "Hallo",
	es: "Hola",
	fr: "Bonjour",
	"pt-BR": "Olá",
	tr: "Merhaba",
	"zh-Hans": "你好",
} as const;

describe("the language the agent writes in", () => {
	it("falls back to English unless RELOOP_GERMAN is exactly true", () => {
		for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
			const env = { RELOOP_GERMAN: value };
			expect(defaultLanguage(env)).toBe("en");
			expect(resolveLanguage(null, env)).toBe("en");
			expect(currentLanguage(env)).toBe("en");
		}
	});

	it("falls back to German on a self-hosted install that sets RELOOP_GERMAN", () => {
		const env = { RELOOP_GERMAN: "true" };
		expect(resolveLanguage(null, env)).toBe("de");
		expect(currentLanguage(env)).toBe("de");
		expect(language(currentLanguage(env))).toBe("German");
		expect(say(HELLO, currentLanguage(env))).toBe("Hallo");
	});

	it("prefers the workspace setting over the env default", () => {
		expect(resolveLanguage("es", { RELOOP_GERMAN: "true" })).toBe("es");
		expect(resolveLanguage("en", { RELOOP_GERMAN: "true" })).toBe("en");
	});

	it("falls back safely on an unknown or empty stored value", () => {
		for (const value of [null, undefined, "", " ", "xx", "EN", "de-DE", 3]) {
			const parsed = parseAgentLanguage(value);
			expect(parsed).toBeNull();
			expect(resolveLanguage(parsed, {})).toBe("en");
			expect(resolveLanguage(parsed, { RELOOP_GERMAN: "true" })).toBe("de");
		}
	});

	it("names every language in English for a prompt and says a line in each", () => {
		for (const locale of LOCALES) {
			expect(language(locale).length).toBeGreaterThan(0);
			expect(say(HELLO, locale)).toBe(HELLO[locale]);
		}
		expect(language("zh-Hans")).toBe("Simplified Chinese");
	});
});
