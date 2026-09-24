import type { Db } from "@crm/db";
import { LOCALES } from "@crm/db/locale";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";

export const agentLanguage = z.enum(LOCALES);

export type AgentLanguage = z.infer<typeof agentLanguage>;

export function defaultAgentLanguage(
	german: string | undefined,
): AgentLanguage {
	return german === "true" ? "de" : "en";
}

export function agentLanguageFlag(value: string): AgentLanguage {
	const parsed = agentLanguage.safeParse(value);
	if (!parsed.success) {
		throw new Error(`--language takes one of ${LOCALES.join(", ")}.`);
	}
	return parsed.data;
}

export function parseAgentLanguage(value: unknown): AgentLanguage | null {
	const parsed = agentLanguage.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export async function readAgentLanguage(db: Db): Promise<AgentLanguage | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { agentLanguage: true },
	});

	return parseAgentLanguage(row?.agentLanguage);
}

export async function writeAgentLanguage(
	db: Db,
	language: AgentLanguage,
): Promise<AgentLanguage> {
	const agentLanguage = parseAgentLanguage(language);
	if (!agentLanguage) throw new Error(`${language} is not a language.`);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, agentLanguage },
		update: { agentLanguage },
	});

	return agentLanguage;
}
