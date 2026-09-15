import type { Locale } from "./locale";

const formats = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();

export function dateFormat(
	locale: Locale,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${locale}:${JSON.stringify(options)}`;
	const cached = formats.get(key);
	if (cached) return cached;

	const format = new Intl.DateTimeFormat(
		locale === "de" ? "de-DE" : "en-US",
		options,
	);
	formats.set(key, format);
	return format;
}

export function numberFormat(locale: Locale): Intl.NumberFormat {
	const key = `n:${locale}`;
	const cached = numbers.get(key);
	if (cached) return cached;

	const format = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US");
	numbers.set(key, format);
	return format;
}
