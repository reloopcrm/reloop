import { DealStage } from "@crm/db";
import { USAGE_COUNTERS } from "@crm/db/plan-usage";
import { CAPACITY_COUNTERS } from "@crm/db/plans";
import {
	MAX_ARCHIVE_RETENTION_DAYS,
	MIN_ARCHIVE_RETENTION_DAYS,
} from "@crm/db/settings";
import { agentLanguage } from "@crm/validation/agent-language";
import { chatgptLoginState } from "@crm/validation/chatgpt-login";
import { DEAL_STAGE_NAME_MAX } from "@crm/validation/deal-stage-names";
import { z } from "zod";

export const archiveRetentionOutput = z.object({
	days: z.number(),
});

export type ArchiveRetentionSettings = z.infer<typeof archiveRetentionOutput>;

export const agentLanguageOutput = z.object({
	language: agentLanguage.nullable(),
	fallback: agentLanguage,
	hosted: z.boolean(),
});

export type AgentLanguageSettings = z.infer<typeof agentLanguageOutput>;

export const setAgentLanguageInput = z.object({
	language: agentLanguage,
});

const agentProvider = z.enum(["openrouter", "chatgpt", "openai", "anthropic"]);

const openrouterModelName = z
	.string()
	.trim()
	.max(100)
	.regex(
		/^[a-z0-9.:/-]*$/i,
		"A model name has only letters, digits, dots, colons, slashes and dashes.",
	);

const modelName = openrouterModelName.refine(
	(value) => !value.includes("/"),
	"Name the model without a provider prefix, for example gpt-5.5-mini.",
);

const apiKeyInput = z
	.string()
	.trim()
	.max(500)
	.refine((value) => !/\s/.test(value), "An API key has no spaces in it.");

const keyHint = z.object({
	configured: z.boolean(),
	hint: z.string().nullable(),
});

export const agentProviderOutput = z.object({
	fixed: z.boolean(),
	provider: agentProvider,
	openrouterModel: z.string(),
	chatgptModel: z.string(),
	openaiModel: z.string(),
	anthropicModel: z.string(),
	openrouterKey: keyHint,
	openaiKey: keyHint,
	anthropicKey: keyHint,
	researchPerHour: z.number().nullable(),
	readingModel: z.string().nullable(),
	effectiveReadingModel: z.string(),
	draftModel: z.string().nullable(),
	effectiveDraftModel: z.string(),
	defaults: z.object({
		openrouterModel: z.string(),
		chatgptModel: z.string(),
		openaiModel: z.string(),
		anthropicModel: z.string(),
		researchPerHour: z.number(),
		readingModel: z.string(),
		draftModel: z.string(),
	}),
	options: z.record(
		z.string(),
		z.array(z.object({ id: z.string(), label: z.string(), note: z.string() })),
	),
	usage: z
		.object({
			planType: z.string().nullable(),
			primaryUsedPercent: z.number().nullable(),
			primaryResetAt: z.string().nullable(),
			primaryWindowMinutes: z.number().nullable(),
			secondaryUsedPercent: z.number().nullable(),
			secondaryResetAt: z.string().nullable(),
			secondaryWindowMinutes: z.number().nullable(),
			updatedAt: z.string(),
		})
		.nullable(),
	probe: z
		.object({
			outcome: z.string().nullable(),
			finishedAt: z.string().nullable(),
			pending: z.boolean(),
		})
		.nullable(),
});

export type AgentProviderSettings = z.infer<typeof agentProviderOutput>;

export const chatgptLoginOutput = chatgptLoginState;

export type ChatgptLoginSettings = z.infer<typeof chatgptLoginOutput>;

export const chatgptLoginInput = z.object({
	action: z.enum(["start", "cancel"]),
});

export const planOutput = z.object({
	plan: z.string().nullable(),
	label: z.string(),
	limits: z.object({
		contacts: z.number().nullable(),
		mailboxes: z.number().nullable(),
		importMonths: z.number().nullable(),
		importThreads: z.number().nullable(),
		researchPerHour: z.number().nullable(),
		companyResearch: z.boolean(),
		insightsPerMonth: z.number().nullable(),
		draftsPerMonth: z.number().nullable(),
		storageGb: z.number().nullable(),
		researchPerMonth: z.number().nullable(),
	}),
	usage: z.object({
		contacts: z.number(),
		mailboxes: z.number(),
		insightsThisMonth: z.number(),
		draftsThisMonth: z.number(),
	}),
	options: z.array(z.object({ id: z.string(), label: z.string() })),
});

export type PlanSettings = z.infer<typeof planOutput>;

export const aiUsageOutput = z.object({
	fixed: z.boolean(),
	label: z.string(),
	month: z.string(),
	capacity: z.array(
		z.object({
			counter: z.enum(CAPACITY_COUNTERS),
			used: z.number(),
			limit: z.number().nullable(),
		}),
	),
	lines: z.array(
		z.object({
			counter: z.enum(USAGE_COUNTERS),
			used: z.number(),
			limit: z.number().nullable(),
			included: z.boolean(),
			reached: z.boolean(),
		}),
	),
});

export type AiUsageSettings = z.infer<typeof aiUsageOutput>;

export const setPlanInput = z.object({
	plan: z.string().nullable(),
});

export const spendOutput = z.object({
	exchangeRate: z.number(),
	days: z.number(),
	costUsd: z.number(),
	costEur: z.number(),
	calls: z.number(),
	lines: z.array(
		z.object({
			kind: z.string(),
			model: z.string(),
			calls: z.number(),
			costEur: z.number(),
			cacheReadTokens: z.number(),
			priced: z.boolean(),
		}),
	),
});

export type SpendSettings = z.infer<typeof spendOutput>;

export const passwordSignInOutput = z.object({
	enabled: z.boolean(),
	set: z.boolean(),
	minLength: z.number(),
	maxLength: z.number(),
});

export type PasswordSignInSettings = z.infer<typeof passwordSignInOutput>;

export const setPasswordInput = z.object({
	newPassword: z.string().min(1).max(256),
});

export const setAgentProviderInput = z.object({
	provider: agentProvider,
	openrouterModel: openrouterModelName.optional(),
	chatgptModel: modelName.optional(),
	openaiModel: modelName.optional(),
	anthropicModel: modelName.optional(),
	openrouterKey: apiKeyInput.nullable().optional(),
	openaiKey: apiKeyInput.nullable().optional(),
	anthropicKey: apiKeyInput.nullable().optional(),
	researchPerHour: z.number().int().min(1).max(10_000).nullable().optional(),
	readingModel: openrouterModelName.nullable().optional(),
	draftModel: openrouterModelName.nullable().optional(),
});

export type SetAgentProviderInput = z.infer<typeof setAgentProviderInput>;

export const setArchiveRetentionDaysInput = z.object({
	days: z
		.number()
		.int()
		.min(
			MIN_ARCHIVE_RETENTION_DAYS,
			`Retention has to be at least ${MIN_ARCHIVE_RETENTION_DAYS} day.`,
		)
		.max(
			MAX_ARCHIVE_RETENTION_DAYS,
			`Retention cannot be longer than ${MAX_ARCHIVE_RETENTION_DAYS} days.`,
		),
});

export type SetArchiveRetentionDaysInput = z.infer<
	typeof setArchiveRetentionDaysInput
>;

export const draftStyleOutput = z.object({
	rules: z.array(
		z.object({
			id: z.string(),
			text: z.string(),
			learnedAt: z.string(),
		}),
	),
	max: z.number().int(),
});

export type DraftStyleOutput = z.infer<typeof draftStyleOutput>;

export const businessProposalOutput = z.object({ queued: z.boolean() });

export const agentFunctionsOutput = z.object({
	canManage: z.boolean(),
	functions: z.array(
		z.object({
			id: z.string(),
			group: z.string(),
			title: z.string(),
			note: z.string(),
			enabled: z.boolean(),
		}),
	),
});

export type AgentFunctionsSettings = z.infer<typeof agentFunctionsOutput>;

export const setAgentFunctionInput = z.object({
	id: z.string().trim().min(1).max(60),
	enabled: z.boolean(),
});

export type SetAgentFunctionInput = z.infer<typeof setAgentFunctionInput>;

export const forgetDraftStyleRuleInput = z.object({
	ruleId: z.string().trim().min(1).max(40),
});

const dealStageEnum = z.enum(
	Object.values(DealStage) as [DealStage, ...DealStage[]],
);

export const dealStagesOutput = z.object({
	canRename: z.boolean(),
	stages: z.array(
		z.object({
			stage: dealStageEnum,
			name: z.string().nullable(),
		}),
	),
});

export type DealStagesSettings = z.infer<typeof dealStagesOutput>;

export const setDealStageNameInput = z.object({
	stage: dealStageEnum,
	name: z
		.string()
		.trim()
		.max(
			DEAL_STAGE_NAME_MAX,
			`A stage name takes at most ${DEAL_STAGE_NAME_MAX} characters.`,
		)
		.nullable(),
});

export type SetDealStageNameInput = z.infer<typeof setDealStageNameInput>;
