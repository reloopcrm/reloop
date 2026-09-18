import type { Locale } from "@crm/db/locale";
import deAgentBuilder from "./de/agent-builder.json";
import deCopy from "./de/copy.json";
import deCrmRecords from "./de/crm-records.json";
import deLanding from "./de/landing.json";
import deNavigation from "./de/navigation.json";
import deQuotes from "./de/quotes.json";
import deRecords from "./de/records.json";
import deServerCopy from "./de/server-copy.json";
import deSettings from "./de/settings.json";
import deSettingsMore from "./de/settings-more.json";
import deStatus from "./de/status.json";
import deUi from "./de/ui.json";
import deWinBack from "./de/win-back.json";
import esAgentBuilder from "./es/agent-builder.json";
import esCopy from "./es/copy.json";
import esCrmRecords from "./es/crm-records.json";
import esLanding from "./es/landing.json";
import esNavigation from "./es/navigation.json";
import esQuotes from "./es/quotes.json";
import esRecords from "./es/records.json";
import esServerCopy from "./es/server-copy.json";
import esSettings from "./es/settings.json";
import esSettingsMore from "./es/settings-more.json";
import esStatus from "./es/status.json";
import esUi from "./es/ui.json";
import esWinBack from "./es/win-back.json";
import frAgentBuilder from "./fr/agent-builder.json";
import frCopy from "./fr/copy.json";
import frCrmRecords from "./fr/crm-records.json";
import frLanding from "./fr/landing.json";
import frNavigation from "./fr/navigation.json";
import frQuotes from "./fr/quotes.json";
import frRecords from "./fr/records.json";
import frServerCopy from "./fr/server-copy.json";
import frSettings from "./fr/settings.json";
import frSettingsMore from "./fr/settings-more.json";
import frStatus from "./fr/status.json";
import frUi from "./fr/ui.json";
import frWinBack from "./fr/win-back.json";
import type { Dictionary } from "./locale";
import ptBRAgentBuilder from "./pt-BR/agent-builder.json";
import ptBRCopy from "./pt-BR/copy.json";
import ptBRCrmRecords from "./pt-BR/crm-records.json";
import ptBRLanding from "./pt-BR/landing.json";
import ptBRNavigation from "./pt-BR/navigation.json";
import ptBRQuotes from "./pt-BR/quotes.json";
import ptBRRecords from "./pt-BR/records.json";
import ptBRServerCopy from "./pt-BR/server-copy.json";
import ptBRSettings from "./pt-BR/settings.json";
import ptBRSettingsMore from "./pt-BR/settings-more.json";
import ptBRStatus from "./pt-BR/status.json";
import ptBRUi from "./pt-BR/ui.json";
import ptBRWinBack from "./pt-BR/win-back.json";
import trAgentBuilder from "./tr/agent-builder.json";
import trCopy from "./tr/copy.json";
import trCrmRecords from "./tr/crm-records.json";
import trLanding from "./tr/landing.json";
import trNavigation from "./tr/navigation.json";
import trQuotes from "./tr/quotes.json";
import trRecords from "./tr/records.json";
import trServerCopy from "./tr/server-copy.json";
import trSettings from "./tr/settings.json";
import trSettingsMore from "./tr/settings-more.json";
import trStatus from "./tr/status.json";
import trUi from "./tr/ui.json";
import trWinBack from "./tr/win-back.json";
import zhHansAgentBuilder from "./zh-Hans/agent-builder.json";
import zhHansCopy from "./zh-Hans/copy.json";
import zhHansCrmRecords from "./zh-Hans/crm-records.json";
import zhHansLanding from "./zh-Hans/landing.json";
import zhHansNavigation from "./zh-Hans/navigation.json";
import zhHansQuotes from "./zh-Hans/quotes.json";
import zhHansRecords from "./zh-Hans/records.json";
import zhHansServerCopy from "./zh-Hans/server-copy.json";
import zhHansSettings from "./zh-Hans/settings.json";
import zhHansSettingsMore from "./zh-Hans/settings-more.json";
import zhHansStatus from "./zh-Hans/status.json";
import zhHansUi from "./zh-Hans/ui.json";
import zhHansWinBack from "./zh-Hans/win-back.json";

export const DICTIONARY_MODULES = {
	en: {},
	de: {
		"agent-builder": deAgentBuilder,
		copy: deCopy,
		"crm-records": deCrmRecords,
		landing: deLanding,
		navigation: deNavigation,
		quotes: deQuotes,
		records: deRecords,
		"server-copy": deServerCopy,
		settings: deSettings,
		"settings-more": deSettingsMore,
		status: deStatus,
		ui: deUi,
		"win-back": deWinBack,
	},
	es: {
		"agent-builder": esAgentBuilder,
		copy: esCopy,
		"crm-records": esCrmRecords,
		landing: esLanding,
		navigation: esNavigation,
		quotes: esQuotes,
		records: esRecords,
		"server-copy": esServerCopy,
		settings: esSettings,
		"settings-more": esSettingsMore,
		status: esStatus,
		ui: esUi,
		"win-back": esWinBack,
	},
	fr: {
		"agent-builder": frAgentBuilder,
		copy: frCopy,
		"crm-records": frCrmRecords,
		landing: frLanding,
		navigation: frNavigation,
		quotes: frQuotes,
		records: frRecords,
		"server-copy": frServerCopy,
		settings: frSettings,
		"settings-more": frSettingsMore,
		status: frStatus,
		ui: frUi,
		"win-back": frWinBack,
	},
	"pt-BR": {
		"agent-builder": ptBRAgentBuilder,
		copy: ptBRCopy,
		"crm-records": ptBRCrmRecords,
		landing: ptBRLanding,
		navigation: ptBRNavigation,
		quotes: ptBRQuotes,
		records: ptBRRecords,
		"server-copy": ptBRServerCopy,
		settings: ptBRSettings,
		"settings-more": ptBRSettingsMore,
		status: ptBRStatus,
		ui: ptBRUi,
		"win-back": ptBRWinBack,
	},
	tr: {
		"agent-builder": trAgentBuilder,
		copy: trCopy,
		"crm-records": trCrmRecords,
		landing: trLanding,
		navigation: trNavigation,
		quotes: trQuotes,
		records: trRecords,
		"server-copy": trServerCopy,
		settings: trSettings,
		"settings-more": trSettingsMore,
		status: trStatus,
		ui: trUi,
		"win-back": trWinBack,
	},
	"zh-Hans": {
		"agent-builder": zhHansAgentBuilder,
		copy: zhHansCopy,
		"crm-records": zhHansCrmRecords,
		landing: zhHansLanding,
		navigation: zhHansNavigation,
		quotes: zhHansQuotes,
		records: zhHansRecords,
		"server-copy": zhHansServerCopy,
		settings: zhHansSettings,
		"settings-more": zhHansSettingsMore,
		status: zhHansStatus,
		ui: zhHansUi,
		"win-back": zhHansWinBack,
	},
} satisfies Record<Locale, Record<string, Dictionary>>;

function merge(modules: Record<string, Dictionary>): Dictionary {
	const dictionary: Dictionary = {};
	for (const module of Object.values(modules))
		for (const [key, value] of Object.entries(module)) dictionary[key] = value;
	return dictionary;
}

export const DICTIONARIES = {
	en: merge({}),
	de: merge(DICTIONARY_MODULES.de),
	es: merge(DICTIONARY_MODULES.es),
	fr: merge(DICTIONARY_MODULES.fr),
	"pt-BR": merge(DICTIONARY_MODULES["pt-BR"]),
	tr: merge(DICTIONARY_MODULES.tr),
	"zh-Hans": merge(DICTIONARY_MODULES["zh-Hans"]),
} satisfies Record<Locale, Dictionary>;
