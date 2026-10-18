import { cookies, headers } from "next/headers";
import { DICTIONARIES } from "./dictionaries";
import {
	DEFAULT_LOCALE,
	type Dictionary,
	isLocale,
	LOCALE_COOKIE,
	type Locale,
	matchLocale,
	type Translate,
	translator,
} from "./locale";

export async function getLocale(): Promise<Locale> {
	const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
	if (isLocale(chosen)) return chosen;

	const header = (await headers()).get("accept-language");
	return matchLocale(header) ?? DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dictionary {
	return DICTIONARIES[locale];
}

export async function getT(): Promise<Translate> {
	return translator(DICTIONARIES[await getLocale()]);
}
