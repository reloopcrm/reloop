import type { Db } from "./client";
import {
	DEFAULT_REPORTING_CURRENCY,
	isCurrencyCode,
	normalizeCurrency,
} from "./currency";
import type { Prisma } from "./generated/prisma/client";
export const SETTINGS_ID = "app";

export const AGENT_PROVIDERS = [
	"openrouter",
	"chatgpt",
	"openai",
	"anthropic",
] as const;

export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_PROVIDER_DEFAULTS = {
	openrouter: { model: "openai/gpt-6-luna", contextWindowTokens: 200_000 },
	chatgpt: { model: "gpt-5.6-terra", contextWindowTokens: 200_000 },
	openai: { model: "gpt-5.6-terra", contextWindowTokens: 400_000 },
	anthropic: { model: "claude-haiku-4-5", contextWindowTokens: 200_000 },
} as const;

export const AGENT_MODEL_OPTIONS = {
	openrouter: [
		{ id: "openai/gpt-6-luna", label: "GPT-6 Luna", note: "Cheapest" },
		{ id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Recommended" },
		{ id: "openai/gpt-6-sol", label: "GPT-6 Sol", note: "Stronger" },
		{ id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", note: "" },
	],
	chatgpt: [
		{
			id: "gpt-6-astra",
			label: "GPT-6 Astra",
			note: "Strongest, 6 s per read",
		},
		{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", note: "6 s per read" },
		{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Fast, 3 s per read" },
		{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna", note: "Fast, 3 s per read" },
	],
	openai: [
		{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna", note: "Cheapest" },
		{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Recommended" },
		{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", note: "Stronger" },
		{ id: "gpt-5.5", label: "GPT-5.5", note: "" },
	],
	anthropic: [
		{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Cheap" },
		{ id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "" },
		{ id: "claude-opus-5", label: "Claude Opus 5", note: "" },
	],
} as const;

export const AGENT_READING_DEFAULT = {
	openrouter: "openai/gpt-6-luna",
	chatgpt: "gpt-5.6-terra",
	openai: "gpt-5.6-terra",
	anthropic: "claude-haiku-4-5",
} as const;

export const AGENT_DRAFT_DEFAULT = {
	openrouter: "openai/gpt-6-sol",
	chatgpt: "gpt-5.6-sol",
	openai: "gpt-5.6-sol",
	anthropic: "claude-sonnet-5",
} as const;

export const CHATGPT_SUBSCRIPTION = {
	defaultModel: AGENT_PROVIDER_DEFAULTS.chatgpt.model,
	contextWindowTokens: AGENT_PROVIDER_DEFAULTS.chatgpt.contextWindowTokens,
} as const;

export const AGENT_RESEARCH_PER_HOUR = {
	default: 60,
	min: 1,
	max: 10_000,
} as const;

export interface AgentProviderSetting {
	provider: AgentProvider;
	openrouterModel: string;
	chatgptModel: string;
	openaiModel: string;
	anthropicModel: string;
	openrouterKey: string | null;
	openaiKey: string | null;
	anthropicKey: string | null;
	researchPerHour: number | null;
	readingModel: string | null;
	draftModel: string | null;
}

export function isAgentProvider(value: string): value is AgentProvider {
	return (AGENT_PROVIDERS as readonly string[]).includes(value);
}

export async function readAgentProvider(db: Db): Promise<AgentProviderSetting> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: {
			agentProvider: true,
			agentOpenrouterKey: true,
			agentOpenrouterModel: true,
			agentChatgptModel: true,
			agentOpenaiKey: true,
			agentOpenaiModel: true,
			agentAnthropicKey: true,
			agentAnthropicModel: true,
			agentResearchPerHour: true,
			agentReadingModel: true,
			agentDraftModel: true,
		},
	});

	const provider =
		row?.agentProvider && isAgentProvider(row.agentProvider)
			? row.agentProvider
			: "openrouter";

	return {
		provider,
		openrouterModel:
			row?.agentOpenrouterModel?.trim() ||
			AGENT_PROVIDER_DEFAULTS.openrouter.model,
		chatgptModel:
			row?.agentChatgptModel?.trim() || AGENT_PROVIDER_DEFAULTS.chatgpt.model,
		openaiModel:
			row?.agentOpenaiModel?.trim() || AGENT_PROVIDER_DEFAULTS.openai.model,
		anthropicModel:
			row?.agentAnthropicModel?.trim() ||
			AGENT_PROVIDER_DEFAULTS.anthropic.model,
		openrouterKey: row?.agentOpenrouterKey?.trim() || null,
		openaiKey: row?.agentOpenaiKey?.trim() || null,
		anthropicKey: row?.agentAnthropicKey?.trim() || null,
		researchPerHour: row?.agentResearchPerHour ?? null,
		readingModel: row?.agentReadingModel?.trim() || null,
		draftModel: row?.agentDraftModel?.trim() || null,
	};
}

export function readingModelFor(setting: AgentProviderSetting): string {
	return setting.readingModel ?? AGENT_READING_DEFAULT[setting.provider];
}

export function draftModelFor(setting: AgentProviderSetting): string {
	return setting.draftModel ?? AGENT_DRAFT_DEFAULT[setting.provider];
}

export interface AgentChatModel {
	id: string;
	contextWindowTokens: number;
}

export function chatModelFor(setting: AgentProviderSetting): AgentChatModel {
	return {
		id: setting[`${setting.provider}Model`],
		contextWindowTokens:
			AGENT_PROVIDER_DEFAULTS[setting.provider].contextWindowTokens,
	};
}

export interface StoredProviderModels {
	provider: AgentProvider;
	readingModel: string | null;
	draftModel: string | null;
}

export interface ProviderModelChoice {
	provider: AgentProvider;
	readingModel?: string | null;
	draftModel?: string | null;
}

function chosenAfresh(
	chosen: string | null | undefined,
	stored: string | null,
): string | null {
	return chosen === undefined || chosen === stored ? null : chosen;
}

export function modelsAfterSwitch(
	current: StoredProviderModels,
	next: ProviderModelChoice,
): Pick<ProviderModelChoice, "readingModel" | "draftModel"> {
	if (current.provider === next.provider) {
		return { readingModel: next.readingModel, draftModel: next.draftModel };
	}

	return {
		readingModel: chosenAfresh(next.readingModel, current.readingModel),
		draftModel: chosenAfresh(next.draftModel, current.draftModel),
	};
}

async function readStoredModels(db: Db): Promise<StoredProviderModels> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: {
			agentProvider: true,
			agentReadingModel: true,
			agentDraftModel: true,
		},
	});

	return {
		provider:
			row?.agentProvider && isAgentProvider(row.agentProvider)
				? row.agentProvider
				: "openrouter",
		readingModel: row?.agentReadingModel?.trim() || null,
		draftModel: row?.agentDraftModel?.trim() || null,
	};
}

export async function writeAgentProvider(
	db: Db,
	setting: Partial<AgentProviderSetting> & { provider: AgentProvider },
): Promise<void> {
	const models = modelsAfterSwitch(await readStoredModels(db), setting);
	const fields: Prisma.AppSettingUpdateInput = {
		agentProvider: setting.provider,
	};

	if (setting.openrouterModel !== undefined) {
		fields.agentOpenrouterModel = setting.openrouterModel.trim() || null;
	}
	if (setting.chatgptModel !== undefined) {
		fields.agentChatgptModel = setting.chatgptModel.trim() || null;
	}
	if (setting.openaiModel !== undefined) {
		fields.agentOpenaiModel = setting.openaiModel.trim() || null;
	}
	if (setting.anthropicModel !== undefined) {
		fields.agentAnthropicModel = setting.anthropicModel.trim() || null;
	}
	if (setting.openrouterKey !== undefined) {
		fields.agentOpenrouterKey = setting.openrouterKey;
	}
	if (setting.openaiKey !== undefined)
		fields.agentOpenaiKey = setting.openaiKey;
	if (setting.anthropicKey !== undefined) {
		fields.agentAnthropicKey = setting.anthropicKey;
	}
	if (setting.researchPerHour !== undefined) {
		fields.agentResearchPerHour = setting.researchPerHour;
	}
	if (models.readingModel !== undefined) {
		fields.agentReadingModel = models.readingModel?.trim() || null;
	}
	if (models.draftModel !== undefined) {
		fields.agentDraftModel = models.draftModel?.trim() || null;
	}

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			...(fields as Omit<Prisma.AppSettingCreateInput, "id">),
			id: SETTINGS_ID,
		},
		update: fields,
	});
}

export async function readReportingCurrency(db: Db): Promise<string> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { reportingCurrency: true },
	});

	const stored = normalizeCurrency(row?.reportingCurrency);

	return isCurrencyCode(stored) ? stored : DEFAULT_REPORTING_CURRENCY;
}

export async function writeReportingCurrency(
	db: Db,
	code: string,
): Promise<string> {
	const reportingCurrency = normalizeCurrency(code);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, reportingCurrency },
		update: { reportingCurrency },
	});

	return reportingCurrency;
}

export async function readRatesRefreshedAt(db: Db): Promise<Date | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { ratesRefreshedAt: true },
	});

	return row?.ratesRefreshedAt ?? null;
}

export async function writeRatesRefreshedAt(
	db: Db,
	ratesRefreshedAt: Date,
): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ratesRefreshedAt },
		update: { ratesRefreshedAt },
	});
}

export const DEFAULT_ARCHIVE_RETENTION_DAYS = 180;

export const MIN_ARCHIVE_RETENTION_DAYS = 1;

export const MAX_ARCHIVE_RETENTION_DAYS = 3650;

export async function readPlan(db: Db): Promise<string | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { plan: true },
	});

	return row?.plan ?? null;
}

export async function writePlan(
	db: Db,
	plan: string | null,
): Promise<string | null> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, plan },
		update: { plan },
	});

	return plan;
}

export async function readArchiveRetentionDays(db: Db): Promise<number> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { archiveRetentionDays: true },
	});

	return row?.archiveRetentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
}

export async function writeArchiveRetentionDays(
	db: Db,
	days: number,
): Promise<number> {
	const archiveRetentionDays = Math.min(
		Math.max(Math.round(days), MIN_ARCHIVE_RETENTION_DAYS),
		MAX_ARCHIVE_RETENTION_DAYS,
	);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, archiveRetentionDays },
		update: { archiveRetentionDays },
	});

	return archiveRetentionDays;
}

export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : "••••";
}
