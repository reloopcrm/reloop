import {
	DEFAULT_LOCALE,
	isLocale,
	isMachineTranslated,
	LOCALE,
	LOCALES,
	type Locale,
} from "@crm/db/locale";

export {
	DEFAULT_LOCALE,
	isLocale,
	isMachineTranslated,
	LOCALE,
	LOCALES,
	type Locale,
};

export const LOCALE_COOKIE = "crm.locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLocale(value: string | null | undefined): Locale {
	return isLocale(value) ? value : DEFAULT_LOCALE;
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

export function translator(dictionary: Dictionary): Translate {
	return (text, vars) => interpolate(dictionary[text] ?? text, vars);
}
