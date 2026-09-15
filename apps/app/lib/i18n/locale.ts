export const LOCALES = ["de", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "crm.locale";

export const DEFAULT_LOCALE: Locale = "en";

export function parseLocale(
	value: string | null | undefined,
	germanOffered: boolean,
): Locale {
	return germanOffered && value === "de" ? "de" : DEFAULT_LOCALE;
}

export type Dictionary = Record<string, string>;

export type Translate = (
	text: string,
	vars?: Record<string, string | number>,
) => string;

export function interpolate(
	template: string,
	vars?: Record<string, string | number>,
): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in vars ? String(vars[key]) : match,
	);
}

export function translator(locale: Locale, dictionary: Dictionary): Translate {
	return (text, vars) =>
		interpolate(locale === "en" ? text : (dictionary[text] ?? text), vars);
}
