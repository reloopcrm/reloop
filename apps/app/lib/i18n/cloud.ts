import type { Locale } from "@crm/db/locale";
import deLanding from "./de/landing.json";
import esLanding from "./es/landing.json";
import frLanding from "./fr/landing.json";
import type { Dictionary } from "./locale";
import ptBRLanding from "./pt-BR/landing.json";
import trLanding from "./tr/landing.json";
import zhHansLanding from "./zh-Hans/landing.json";

export const CLOUD_DICTIONARY_MODULES = {
	en: {},
	de: { landing: deLanding },
	es: { landing: esLanding },
	fr: { landing: frLanding },
	"pt-BR": { landing: ptBRLanding },
	tr: { landing: trLanding },
	"zh-Hans": { landing: zhHansLanding },
} satisfies Record<Locale, Record<string, Dictionary>>;
