import { cookies } from "next/headers";
import { DICTIONARIES } from "./dictionaries";
import {
	type Dictionary,
	LOCALE_COOKIE,
	type Locale,
	parseLocale,
	type Translate,
	translator,
} from "./locale";

export async function getLocale(): Promise<Locale> {
	return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export function getDictionary(locale: Locale): Dictionary {
	return DICTIONARIES[locale];
}

export async function getT(): Promise<Translate> {
	return translator(DICTIONARIES[await getLocale()]);
}
