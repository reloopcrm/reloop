import type { Locale } from "@crm/db/locale";
import deCloud from "./de/cloud.json";
import esCloud from "./es/cloud.json";
import frCloud from "./fr/cloud.json";
import type { Dictionary } from "./locale";
import ptBRCloud from "./pt-BR/cloud.json";
import trCloud from "./tr/cloud.json";
import zhHansCloud from "./zh-Hans/cloud.json";

export const CLOUD_DICTIONARY_MODULES = {
	en: {},
	de: { cloud: deCloud },
	es: { cloud: esCloud },
	fr: { cloud: frCloud },
	"pt-BR": { cloud: ptBRCloud },
	tr: { cloud: trCloud },
	"zh-Hans": { cloud: zhHansCloud },
} satisfies Record<Locale, Record<string, Dictionary>>;
