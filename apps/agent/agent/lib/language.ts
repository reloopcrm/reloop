import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@crm/db";
import { LOCALE, type Locale } from "@crm/db/locale";
import { currentTenantId } from "@crm/db/tenant-context";
import {
	type AgentLanguage,
	defaultAgentLanguage,
	readAgentLanguage,
} from "@crm/validation/agent-language";
import { DISPATCH } from "./dispatch-config";

export type Lines = Record<Locale, string>;

const scope = new AsyncLocalStorage<Locale>();

const cache = new Map<string, { language: Locale; until: number }>();

export function defaultLanguage(env: NodeJS.ProcessEnv = process.env): Locale {
	return defaultAgentLanguage(env.RELOOP_GERMAN);
}

export function resolveLanguage(
	stored: AgentLanguage | null,
	env: NodeJS.ProcessEnv = process.env,
): Locale {
	return stored ?? defaultLanguage(env);
}

async function workspaceLanguage(): Promise<Locale> {
	const key = currentTenantId() ?? "";
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

	const resolved = resolveLanguage(stored);
	cache.set(key, {
		language: resolved,
		until: Date.now() + DISPATCH.language.cacheMs,
	});
	return resolved;
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
	return scope.getStore() ?? defaultLanguage(env);
}

export function language(locale: Locale = currentLanguage()): string {
	return LOCALE.englishNames[locale];
}

export function say(lines: Lines, locale: Locale = currentLanguage()): string {
	return lines[locale];
}
