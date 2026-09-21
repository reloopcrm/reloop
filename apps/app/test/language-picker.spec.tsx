import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/" });

const navigation = { ...(await import("next/navigation")) };

mock.module("next/navigation", () => ({
	...navigation,
	useRouter: () => ({ refresh: () => {} }),
}));

const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { LOCALE, LOCALES } = await import("@crm/db/locale");
const { Language } = await import("../app/(app)/[slug]/settings/language");
const { I18nProvider, writeLocaleCookie } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { LOCALE_COOKIE, parseLocale } = await import("../lib/i18n/locale");

afterAll(() => {
	mock.module("next/navigation", () => navigation);
	GlobalRegistrator.unregister();
});

function cookieValue(name: string): string | undefined {
	return document.cookie
		.split(";")
		.map((part) => part.trim().split("="))
		.find(([key]) => key === name)?.[1];
}

function cardText(locale: (typeof LOCALES)[number]): string {
	const markup = renderToString(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(Language, {}),
		}),
	);

	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return (holder.textContent ?? "").trim();
}

describe("the language picker", () => {
	it("stores a choice and reads it back", () => {
		for (const locale of LOCALES) {
			writeLocaleCookie(locale);

			expect(cookieValue(LOCALE_COOKIE)).toBe(locale);
			expect(parseLocale(cookieValue(LOCALE_COOKIE))).toBe(locale);
		}
	});

	it("reads back English when the cookie holds a language nobody added", () => {
		expect(parseLocale("kl")).toBe("en");
		expect(parseLocale(null)).toBe("en");
		expect(parseLocale(undefined)).toBe("en");
	});

	it("names the chosen language in that language", () => {
		for (const locale of LOCALES)
			expect(cardText(locale)).toContain(LOCALE.names[locale]);
	});

	it("says a machine translated language is machine translated", () => {
		for (const locale of LOCALE.machineTranslated) {
			const text = cardText(locale);
			const sentence =
				DICTIONARIES[locale]["{language} is machine translated."];

			expect(sentence).toBeString();
			expect(text).toContain(
				(sentence ?? "").replace("{language}", LOCALE.names[locale]),
			);
		}
	});

	it("invites a correction on GitHub in a machine translated language", () => {
		for (const locale of LOCALE.machineTranslated) {
			const text = cardText(locale);
			const invitation =
				DICTIONARIES[locale]["Fix a word on GitHub"] ?? "Fix a word on GitHub";

			expect(text).toContain(invitation);
		}
	});

	it("says nothing about translation when people wrote the language", () => {
		for (const locale of LOCALE.writtenByPeople) {
			const text = cardText(locale);
			const invitation =
				DICTIONARIES[locale]["Fix a word on GitHub"] ?? "Fix a word on GitHub";

			expect(text).not.toContain(invitation);
			expect(text).not.toContain("machine");
		}
	});
});
