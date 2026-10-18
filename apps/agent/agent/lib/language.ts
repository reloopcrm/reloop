import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { LOCALE, type Locale } from "@crm/db/locale";
import {
	type AgentLanguage,
	CONVERSATION_LANGUAGE,
	defaultAgentLanguage,
	readAgentLanguage,
	type SummaryLanguage,
	summaryLanguage as summaryLanguageOf,
} from "@crm/validation/agent-language";
import { DISPATCH } from "./dispatch-config";

export type Lines = Record<Locale, string>;

const scope = new AsyncLocalStorage<AgentLanguage | null>();

const cache = new Map<
	string,
	{ language: AgentLanguage | null; until: number }
>();

export function defaultLanguage(env: NodeJS.ProcessEnv = process.env): Locale {
	return defaultAgentLanguage(env.RELOOP_GERMAN);
}

export function resolveLanguage(
	stored: AgentLanguage | null,
	env: NodeJS.ProcessEnv = process.env,
): Locale {
	return stored ?? defaultLanguage(env);
}

async function workspaceLanguage(): Promise<AgentLanguage | null> {
	const key = cloud.scopeId() ?? "";
	const hit = cache.get(key);
	if (hit && hit.until > Date.now()) return hit.language;

	let stored: AgentLanguage | null = null;
	try {
		stored = await readAgentLanguage(db);
	} catch (cause) {
		console.error(
			`[agent] the workspace language could not be read, so the agent writes ${language(defaultLanguage())}: ${cause instanceof Error ? cause.message : String(cause)}`,
		);
	}

	cache.set(key, {
		language: stored,
		until: Date.now() + DISPATCH.language.cacheMs,
	});
	return stored;
}

export function forgetWorkspaceLanguages(): void {
	cache.clear();
}

export async function inWorkspaceLanguage<T>(
	fn: () => Promise<T> | T,
): Promise<T> {
	return scope.run(await workspaceLanguage(), fn);
}

export function currentLanguage(env: NodeJS.ProcessEnv = process.env): Locale {
	return resolveLanguage(scope.getStore() ?? null, env);
}

export function summaryLanguage(
	env: NodeJS.ProcessEnv = process.env,
): SummaryLanguage {
	return summaryLanguageOf(scope.getStore() ?? null, env.RELOOP_GERMAN);
}

export function summaryWrittenIn(
	wanted: SummaryLanguage = summaryLanguage(),
): string {
	return wanted === CONVERSATION_LANGUAGE
		? "the language the conversation is written in"
		: language(wanted);
}

export function language(locale: Locale = currentLanguage()): string {
	return LOCALE.englishNames[locale];
}

export function say(lines: Lines, locale: Locale = currentLanguage()): string {
	return lines[locale];
}
