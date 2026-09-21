import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { DOCUMENT_LANGUAGE_SCRIPT, matchLocale } from "../lib/i18n/locale";

const owned = !("document" in globalThis);
if (owned) GlobalRegistrator.register({ url: "https://crm.test/" });

const nextHeaders = { ...(await import("next/headers")) };

afterAll(() => {
	mock.module("next/headers", () => nextHeaders);
	if (owned) GlobalRegistrator.unregister();
});

let cookieValue: string | undefined;
let acceptLanguage: string | null;

beforeEach(() => {
	cookieValue = undefined;
	acceptLanguage = null;
});

mock.module("next/headers", () => ({
	...nextHeaders,
	cookies: async () => ({
		get: (name: string) =>
			cookieValue === undefined ? undefined : { name, value: cookieValue },
	}),
	headers: async () => ({
		get: (name: string) =>
			name.toLowerCase() === "accept-language" ? acceptLanguage : null,
	}),
}));

const { getLocale } = await import("../lib/i18n/server");

function runScript(cookie: string | null, language: string): string {
	document.cookie = "crm.locale=; max-age=0; path=/";
	if (cookie !== null) document.cookie = `${cookie}; path=/`;
	Object.defineProperty(navigator, "language", {
		value: language,
		configurable: true,
	});
	document.documentElement.lang = "en";

	new Function(DOCUMENT_LANGUAGE_SCRIPT)();

	return document.documentElement.lang;
}

describe("the language reaches <html> before the first paint", () => {
	it("writes the chosen language, not English", () => {
		expect(runScript("crm.locale=de", "en-US")).toBe("de");
	});

	it("writes the language the browser asks for when no cookie exists", () => {
		expect(runScript(null, "de-AT")).toBe("de-AT");
	});

	it("keeps the served language when the browser says nothing", () => {
		expect(runScript(null, "")).toBe("en");
	});

	it("ignores a cookie that is not a language tag", () => {
		expect(runScript("crm.locale=%3Cscript%3E", "")).toBe("en");
	});
});

describe("the cookie wins over the browser", () => {
	it("keeps the chosen language when the header disagrees", async () => {
		cookieValue = "tr";
		acceptLanguage = "de-DE,de;q=0.9";

		expect(await getLocale()).toBe("tr");
	});

	it("reads the header when the cookie is absent", async () => {
		acceptLanguage = "fr-CA,fr;q=0.9,en;q=0.5";

		expect(await getLocale()).toBe("fr");
	});

	it("reads the header when the cookie holds a language we do not have", async () => {
		cookieValue = "kl";
		acceptLanguage = "zh-CN,zh;q=0.9";

		expect(await getLocale()).toBe("zh-Hans");
	});
});

describe("matchLocale", () => {
	it("takes an exact tag", () => {
		expect(matchLocale("pt-BR")).toBe("pt-BR");
		expect(matchLocale("tr")).toBe("tr");
	});

	it("takes the primary subtag when the region differs", () => {
		expect(matchLocale("de-AT")).toBe("de");
		expect(matchLocale("es-419")).toBe("es");
		expect(matchLocale("pt-PT")).toBe("pt-BR");
		expect(matchLocale("zh-Hans-CN")).toBe("zh-Hans");
	});

	it("follows the quality order, not the written order", () => {
		expect(matchLocale("kl;q=1.0,de;q=0.4,fr;q=0.9")).toBe("fr");
	});

	it("skips a language with quality zero", () => {
		expect(matchLocale("de;q=0,fr;q=0.8")).toBe("fr");
	});

	it("gives nothing back when it knows no language in the header", () => {
		expect(matchLocale("kl,xx-YY")).toBeNull();
		expect(matchLocale("")).toBeNull();
		expect(matchLocale(null)).toBeNull();
	});
});
