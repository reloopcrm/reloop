export const LOCALES = [
	"en",
	"de",
	"es",
	"fr",
	"pt-BR",
	"tr",
	"zh-Hans",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE = {
	names: {
		en: "English",
		de: "Deutsch",
		es: "Español",
		fr: "Français",
		"pt-BR": "Português (Brasil)",
		tr: "Türkçe",
		"zh-Hans": "简体中文",
	},
	englishNames: {
		en: "English",
		de: "German",
		es: "Spanish",
		fr: "French",
		"pt-BR": "Brazilian Portuguese",
		tr: "Turkish",
		"zh-Hans": "Simplified Chinese",
	},
	tags: {
		en: "en-US",
		de: "de-DE",
		es: "es-ES",
		fr: "fr-FR",
		"pt-BR": "pt-BR",
		tr: "tr-TR",
		"zh-Hans": "zh-Hans",
	},
	writtenByPeople: ["en", "de"],
	machineTranslated: ["es", "fr", "pt-BR", "tr", "zh-Hans"],
} as const satisfies {
	names: Record<Locale, string>;
	englishNames: Record<Locale, string>;
	tags: Record<Locale, string>;
	writtenByPeople: readonly Locale[];
	machineTranslated: readonly Locale[];
};

export function isLocale(value: string | null | undefined): value is Locale {
	return LOCALES.some((locale) => locale === value);
}

export function isMachineTranslated(locale: Locale): boolean {
	return LOCALE.machineTranslated.some((value) => value === locale);
}
