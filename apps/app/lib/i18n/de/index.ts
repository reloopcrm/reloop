import type { Dictionary } from "../locale";
import { agentBuilder } from "./agent-builder";
import { copy } from "./copy";
import { crmRecords } from "./crm-records";
import { landing } from "./landing";
import { navigation } from "./navigation";
import { records } from "./records";
import { serverCopy } from "./server-copy";
import { settings } from "./settings";
import { settingsMore } from "./settings-more";
import { status } from "./status";
import { winBack } from "./win-back";

export const de: Dictionary = {
	...agentBuilder,
	...copy,
	...crmRecords,
	...landing,
	...navigation,
	...records,
	...serverCopy,
	...settings,
	...settingsMore,
	...status,
	...winBack,
};
