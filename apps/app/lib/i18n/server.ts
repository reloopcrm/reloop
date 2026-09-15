import { cookies } from "next/headers";
import { de } from "./de";
import {
	LOCALE_COOKIE,
	type Locale,
	parseLocale,
	type Translate,
	translator,
} from "./locale";

export function germanOffered(): boolean {
	return process.env.RELOOP_GERMAN === "true";
}

export async function getLocale(): Promise<Locale> {
	return parseLocale(
		(await cookies()).get(LOCALE_COOKIE)?.value,
		germanOffered(),
	);
}

export async function getT(): Promise<Translate> {
	return translator(await getLocale(), de);
}
