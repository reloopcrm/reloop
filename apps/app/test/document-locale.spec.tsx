import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { matchLocale } from "../lib/i18n/locale";

const nextHeaders = { ...(await import("next/headers")) };

afterAll(() => {
	mock.module("next/headers", () => nextHeaders);
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
