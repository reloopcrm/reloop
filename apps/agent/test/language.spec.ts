import { describe, expect, it } from "bun:test";
import { LOCALES } from "@crm/db/locale";
import { parseAgentLanguage } from "@crm/validation/agent-language";
import { COPY } from "../agent/lib/copy";
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

	it("holds every fixed sentence in every language, with no dash and no empty line", async () => {
		const source = await Bun.file(
			new URL("../agent/lib/copy.ts", import.meta.url),
		).text();
		const count = (pattern: RegExp) => source.match(pattern)?.length ?? 0;

		const english = count(/^\s*en:/gm);
		expect(english).toBeGreaterThan(60);
		for (const locale of LOCALES) {
			const key = locale.includes("-") ? `"${locale}"` : locale;
			expect(count(new RegExp(`^\\s*${key}:`, "gm"))).toBe(english);
		}
		expect(source).not.toMatch(/[\u2013\u2014\u2015]/);
		expect(source).not.toMatch(/:\s*(""|``)[,\n]/);
		expect(Object.keys(COPY).length).toBeGreaterThan(5);
	});
});
