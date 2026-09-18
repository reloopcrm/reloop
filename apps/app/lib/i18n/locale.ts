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

export const DOCUMENT_LANGUAGE_SCRIPT =
	"(function(){try{var found=/(?:^|; )crm\\.locale=([^;]*)/.exec(document.cookie);var tag=found&&found[1]?decodeURIComponent(found[1]):navigator.language;if(/^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(tag))document.documentElement.lang=tag}catch(error){}})()";

export function parseLocale(value: string | null | undefined): Locale {
	return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function matchLocale(header: string | null | undefined): Locale | null {
	if (!header) return null;

	const ranked = header
		.split(",")
		.map((part) => {
			const [tag = "", ...rest] = part.trim().split(";");
			const quality = rest.find((piece) => piece.trim().startsWith("q="));
			return {
				tag: tag.trim().toLowerCase(),
				weight: quality ? Number(quality.trim().slice(2)) : 1,
			};
		})
		.filter(
			({ tag, weight }) => tag !== "" && Number.isFinite(weight) && weight > 0,
		)
		.sort((a, b) => b.weight - a.weight);

	for (const { tag } of ranked) {
		const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
		if (exact) return exact;

		const primary = tag.split("-")[0];
		const near = LOCALES.find(
			(locale) => locale.toLowerCase().split("-")[0] === primary,
		);
		if (near) return near;
	}

	return null;
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
