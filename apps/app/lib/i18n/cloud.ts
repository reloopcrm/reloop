import type { Locale } from "@crm/db/locale";
import type { Dictionary } from "./locale";

export const CLOUD_DICTIONARY_MODULES = {
	en: {},
	de: {},
	es: {},
	fr: {},
	"pt-BR": {},
	tr: {},
	"zh-Hans": {},
} satisfies Record<Locale, Record<string, Dictionary>>;
