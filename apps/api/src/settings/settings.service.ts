import {
	canRenameWorkspace,
	hasPassword,
	isPasswordSignInConfigured,
	isWorkspaceAdmin,
	PASSWORD_RULES,
	type PasswordRefusal,
	PasswordRefused,
	setPasswordFor,
	workspaceRoleOf,
} from "@crm/auth";
import {
	isFreshPasswordSession,
	type PasswordSession,
} from "@crm/auth/password-rules";
import type { Db } from "@crm/db";
import { USAGE_PROBE_KIND } from "@crm/db/agent-tasks";
import { DEAL_STAGES } from "@crm/db/deal-stage";
import { readModelSpend } from "@crm/db/model-spend";
import {
	fixedAiWith,
	planIdOf,
	readMonthlyUsage,
	usageLines,
} from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	INSIGHT_KIND,
	isPlanId,
	limitsOf,
	PLAN_IDS,
	PLANS,
	startOfMonth,
} from "@crm/db/plans";
import { readProviderUsage } from "@crm/db/provider-usage";
import { openSecret, sealSecret, secretKey } from "@crm/db/secrets";
import {
	AGENT_DRAFT_DEFAULT,
	AGENT_MODEL_OPTIONS,
	AGENT_PROVIDER_DEFAULTS,
	AGENT_READING_DEFAULT,
	AGENT_RESEARCH_PER_HOUR,
	draftModelFor,
	maskKey,
	readAgentProvider,
	readArchiveRetentionDays,
	readingModelFor,
	writeAgentProvider,
	writeArchiveRetentionDays,
} from "@crm/db/settings";
import { isHosted } from "@crm/db/tenant-context";
import {
	AGENT_FUNCTIONS,
	isAgentFunction,
	isAgentFunctionEnabled,
	readAgentFunctions,
	writeAgentFunction,
} from "@crm/validation/agent-functions";
import {
	readDealStageNames,
	writeDealStageNames,
} from "@crm/validation/deal-stage-names";
import {
	DRAFT_STYLE,
	readDraftStyle,
	withoutDraftStyleRule,
	writeDraftStyle,
} from "@crm/validation/draft-style";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	type ChatgptLoginAction,
	ResearchKeyService,
} from "../agent/research-key.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { countMailboxes } from "../mailbox/sync-state.service";
import { SETTINGS } from "./settings.config";
import type {
	AgentFunctionsSettings,
	AgentProviderSettings,
	AiUsageSettings,
	ArchiveRetentionSettings,
	ChatgptLoginSettings,
	DealStagesSettings,
	DraftStyleOutput,
	PasswordSignInSettings,
	PlanSettings,
	SetAgentFunctionInput,
	SetAgentProviderInput,
	SetDealStageNameInput,
	SpendSettings,
} from "./settings.contracts";

const PASSWORD_REFUSALS = {
	"sign-in-off":
		'Password sign-in is off. Set PASSWORD_SIGN_IN="1" in the root .env file and restart.',
	"too-short": `The password needs at least ${PASSWORD_RULES.minLength} characters.`,
	"too-long": `The password takes at most ${PASSWORD_RULES.maxLength} characters.`,
	"no-user": "That account no longer exists.",
} satisfies Record<PasswordRefusal, string>;

type ProviderKeyHint = {
	configured: boolean;
	hint: string | null;
};

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly researchKeys: ResearchKeyService,
		private readonly config: ConfigService<EnvironmentVariables, true>,
		private readonly agent: AgentTriggerService,
	) {}

	private async assertManager(userId: string): Promise<void> {
		if (!isWorkspaceAdmin(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a workspace admin can change these settings.",
			);
		}
	}

	private async assertModelChoice(): Promise<void> {
		if (await fixedAiWith(this.db)) {
			throw new ForbiddenException(
				"The AI is included in this plan. There is no model to choose.",
			);
		}
	}

	private assertChatgptOffered(): void {
		if (isHosted()) {
			throw new ForbiddenException(
				"A ChatGPT sign-in is not offered on a hosted install.",
			);
		}
	}

	async refreshUsage(userId: string): Promise<AgentProviderSettings> {
		await this.assertManager(userId);
		await this.assertModelChoice();
		await this.agent.usageProbeRequested();
		return this.agentProvider();
	}

	async aiUsage(): Promise<AiUsageSettings> {
		const [plan, usage, fixed] = await Promise.all([
			planIdOf(this.db),
			readMonthlyUsage(this.db),
			fixedAiWith(this.db),
		]);
		const limits = limitsOf(plan);

		return {
			fixed,
			label: limits.label,
			month: startOfMonth().toISOString(),
			lines: usageLines(usage, limits),
		};
	}

	async passwordSignIn(userId: string): Promise<PasswordSignInSettings> {
		return {
			enabled: isPasswordSignInConfigured(),
			set: isPasswordSignInConfigured() ? await hasPassword(userId) : false,
			minLength: PASSWORD_RULES.minLength,
			maxLength: PASSWORD_RULES.maxLength,
		};
	}

	async setPassword(
		userId: string,
		newPassword: string,
		session: PasswordSession,
		sessionId: string,
	): Promise<PasswordSignInSettings> {
		if (!isFreshPasswordSession(session)) {
			throw new ForbiddenException(
				"Sign out and sign in again before changing your password.",
			);
		}
		try {
			await setPasswordFor(userId, newPassword, sessionId);
		} catch (error) {
			if (error instanceof PasswordRefused) {
				throw new BadRequestException(PASSWORD_REFUSALS[error.reason]);
			}
			throw error;
		}

		this.logger.log({ message: "Password set", userId });

		return this.passwordSignIn(userId);
	}

	async plan(): Promise<PlanSettings> {
		const plan = await planIdOf(this.db);
		const limits = limitsOf(plan);
		const month = startOfMonth();
		const usedThisMonth = (kind: string) =>
			this.db.agentTask.count({ where: { kind, createdAt: { gte: month } } });

		const [contacts, mailboxes, insightsThisMonth, draftsThisMonth] =
			await Promise.all([
				this.db.contact.count({ where: { archivedAt: null } }),
				countMailboxes(this.db),
				usedThisMonth(INSIGHT_KIND),
				usedThisMonth(DRAFT_KIND),
			]);

		return {
			plan: isPlanId(plan) ? plan : null,
			label: limits.label,
			limits: {
				contacts: limits.contacts,
				mailboxes: limits.mailboxes,
				importMonths: limits.importMonths,
				importThreads: limits.importThreads,
				researchPerHour: limits.researchPerHour,
				companyResearch: limits.companyResearch,
				insightsPerMonth: limits.insightsPerMonth,
				draftsPerMonth: limits.draftsPerMonth,
				storageGb: limits.storageGb,
				researchPerMonth: limits.researchPerMonth,
			},
			usage: { contacts, mailboxes, insightsThisMonth, draftsThisMonth },
			options: PLAN_IDS.map((id) => ({ id, label: PLANS[id].label })),
		};
	}

	async spend(): Promise<SpendSettings> {
		const days = SETTINGS.spend.days;
		const since = new Date(Date.now() - days * SETTINGS.spend.dayMs);
		const [report, fixed] = await Promise.all([
			readModelSpend(this.db, since),
			fixedAiWith(this.db),
		]);

		if (fixed) {
			return {
				exchangeRate: SETTINGS.spend.dollarsToEuro,
				days,
				costUsd: 0,
				costEur: 0,
				calls: 0,
				lines: [],
			};
		}

		return {
			exchangeRate: SETTINGS.spend.dollarsToEuro,
			days,
			costUsd: report.costUsd,
			costEur: report.costUsd * SETTINGS.spend.dollarsToEuro,
			calls: report.calls,
			lines: report.lines.map((line) => ({
				kind: line.kind,
				model: line.model,
				calls: line.calls,
				costEur: line.costUsd * SETTINGS.spend.dollarsToEuro,
				cacheReadTokens: line.cacheReadTokens,
				priced: line.priced,
			})),
		};
	}

	async setPlan(userId: string, _plan: string | null): Promise<PlanSettings> {
		await this.assertManager(userId);
		throw new ForbiddenException(
			"Only the server operator can change the plan.",
		);
	}

	private async usageProbe(): Promise<AgentProviderSettings["probe"]> {
		const [pending, last] = await Promise.all([
			this.db.agentTask.count({
				where: { kind: USAGE_PROBE_KIND, finishedAt: null },
			}),
			this.db.agentTask.findFirst({
				where: { kind: USAGE_PROBE_KIND, finishedAt: { not: null } },
				orderBy: { finishedAt: "desc" },
				select: { outcome: true, finishedAt: true },
			}),
		]);

		if (pending === 0 && !last) return null;

		return {
			outcome: last?.outcome ?? null,
			finishedAt: last?.finishedAt?.toISOString() ?? null,
			pending: pending > 0,
		};
	}

	async agentProvider(): Promise<AgentProviderSettings> {
		if (await fixedAiWith(this.db)) return this.includedAi();

		const setting = await readAgentProvider(this.db);
		const [usage, probe] = await Promise.all([
			setting.provider === "chatgpt"
				? readProviderUsage(this.db, "chatgpt")
				: null,
			setting.provider === "chatgpt" ? this.usageProbe() : null,
		]);

		return {
			fixed: false,
			readingModel: setting.readingModel,
			effectiveReadingModel: readingModelFor(setting),
			draftModel: setting.draftModel,
			effectiveDraftModel: draftModelFor(setting),
			options: {
				openrouter: [...AGENT_MODEL_OPTIONS.openrouter],
				chatgpt: [...AGENT_MODEL_OPTIONS.chatgpt],
				openai: [...AGENT_MODEL_OPTIONS.openai],
				anthropic: [...AGENT_MODEL_OPTIONS.anthropic],
			},
			usage: usage
				? {
						planType: usage.planType,
						primaryUsedPercent: usage.primaryUsedPercent,
						primaryResetAt: usage.primaryResetAt?.toISOString() ?? null,
						primaryWindowMinutes: usage.primaryWindowMinutes,
						secondaryUsedPercent: usage.secondaryUsedPercent,
						secondaryResetAt: usage.secondaryResetAt?.toISOString() ?? null,
						secondaryWindowMinutes: usage.secondaryWindowMinutes,
						updatedAt: usage.updatedAt.toISOString(),
					}
				: null,
			probe,
			provider: setting.provider,
			openrouterModel: setting.openrouterModel,
			chatgptModel: setting.chatgptModel,
			openaiModel: setting.openaiModel,
			anthropicModel: setting.anthropicModel,
			openrouterKey: setting.openrouterKey
				? this.keyHint(setting.openrouterKey)
				: { configured: this.openrouterEnvKey(), hint: null },
			openaiKey: this.keyHint(setting.openaiKey),
			anthropicKey: this.keyHint(setting.anthropicKey),
			researchPerHour: setting.researchPerHour,
			defaults: {
				openrouterModel: AGENT_PROVIDER_DEFAULTS.openrouter.model,
				chatgptModel: AGENT_PROVIDER_DEFAULTS.chatgpt.model,
				openaiModel: AGENT_PROVIDER_DEFAULTS.openai.model,
				anthropicModel: AGENT_PROVIDER_DEFAULTS.anthropic.model,
				researchPerHour: AGENT_RESEARCH_PER_HOUR.default,
				readingModel: AGENT_READING_DEFAULT[setting.provider],
				draftModel: AGENT_DRAFT_DEFAULT[setting.provider],
			},
		};
	}

	private includedAi(): AgentProviderSettings {
		const none = { configured: false, hint: null };
		return {
			fixed: true,
			provider: "openrouter",
			openrouterModel: "",
			chatgptModel: "",
			openaiModel: "",
			anthropicModel: "",
			openrouterKey: none,
			openaiKey: none,
			anthropicKey: none,
			researchPerHour: null,
			readingModel: null,
			effectiveReadingModel: "",
			draftModel: null,
			effectiveDraftModel: "",
			defaults: {
				openrouterModel: "",
				chatgptModel: "",
				openaiModel: "",
				anthropicModel: "",
				researchPerHour: AGENT_RESEARCH_PER_HOUR.default,
				readingModel: "",
				draftModel: "",
			},
			options: {},
			usage: null,
			probe: null,
		};
	}

	async setAgentProvider(
		userId: string,
		input: SetAgentProviderInput,
	): Promise<AgentProviderSettings> {
		await this.assertManager(userId);
		if (input.provider === "chatgpt") this.assertChatgptOffered();
		await this.assertModelChoice();
		const current = await readAgentProvider(this.db);

		for (const provider of ["openrouter", "openai", "anthropic"] as const) {
			const candidate = input[`${provider}Key`];
			if (!candidate) continue;
			const check = await this.researchKeys.verifyProvider(provider, candidate);
			if (check.outcome === "invalid") {
				throw new BadRequestException(check.reason);
			}
			this.logger.log({
				message: "Provider key checked",
				provider,
				verified: check.outcome === "valid",
			});
		}

		const openrouterKey = this.sealed(
			input.openrouterKey,
			current.openrouterKey,
		);
		const openaiKey = this.sealed(input.openaiKey, current.openaiKey);
		const anthropicKey = this.sealed(input.anthropicKey, current.anthropicKey);

		if (
			input.provider === "openrouter" &&
			!openrouterKey &&
			!this.openrouterEnvKey()
		) {
			throw new BadRequestException("Paste an OpenRouter API key first.");
		}
		if (input.provider === "openai" && !openaiKey) {
			throw new BadRequestException("Paste an OpenAI API key first.");
		}
		if (input.provider === "anthropic" && !anthropicKey) {
			throw new BadRequestException("Paste an Anthropic API key first.");
		}

		await writeAgentProvider(this.db, {
			provider: input.provider,
			openrouterModel: input.openrouterModel,
			chatgptModel: input.chatgptModel,
			openaiModel: input.openaiModel,
			anthropicModel: input.anthropicModel,
			openrouterKey,
			openaiKey,
			anthropicKey,
			researchPerHour: input.researchPerHour,
			readingModel: input.readingModel,
			draftModel: input.draftModel,
		});

		this.logger.log({
			message: "Agent model provider changed",
			provider: input.provider,
		});

		return this.agentProvider();
	}

	async chatgptLogin(
		userId: string,
		action: ChatgptLoginAction,
	): Promise<ChatgptLoginSettings> {
		await this.assertManager(userId);
		this.assertChatgptOffered();
		await this.assertModelChoice();
		return this.researchKeys.chatgptLogin(action);
	}

	private openrouterEnvKey(): boolean {
		if (isHosted()) return false;
		return Boolean(
			this.config.get("OPENROUTER_API_KEY", { infer: true })?.trim(),
		);
	}

	private sealed(
		input: string | null | undefined,
		current: string | null,
	): string | null {
		if (input === undefined) return current;
		if (input === null || input === "") return null;

		return sealSecret(input, this.secretKey());
	}

	private secretKey(): Buffer {
		return secretKey(
			this.config.get("BETTER_AUTH_SECRET", { infer: true }),
			SETTINGS.providerKeys.purpose,
		);
	}

	private keyHint(sealed: string | null): ProviderKeyHint {
		if (!sealed) return { configured: false, hint: null };

		try {
			return {
				configured: true,
				hint: maskKey(openSecret(sealed, this.secretKey())),
			};
		} catch {
			return { configured: true, hint: null };
		}
	}

	async proposeBusiness(userId: string): Promise<{ queued: boolean }> {
		await this.assertManager(userId);
		return { queued: await this.agent.businessSetupRequested(true) };
	}

	async archiveRetention(): Promise<ArchiveRetentionSettings> {
		return { days: await readArchiveRetentionDays(this.db) };
	}

	async setArchiveRetention(
		userId: string,
		days: number,
	): Promise<ArchiveRetentionSettings> {
		await this.assertManager(userId);
		const saved = await writeArchiveRetentionDays(this.db, days);

		this.logger.log({
			message: "Archive retention changed",
			days: saved,
		});

		return { days: saved };
	}

	async agentFunctions(userId: string): Promise<AgentFunctionsSettings> {
		const [settings, role] = await Promise.all([
			readAgentFunctions(this.db),
			workspaceRoleOf(userId, this.db),
		]);

		return {
			canManage: isWorkspaceAdmin(role),
			functions: AGENT_FUNCTIONS.map((entry) => ({
				id: entry.id,
				group: entry.group,
				title: entry.title,
				note: entry.note,
				enabled: isAgentFunctionEnabled(settings, entry.id),
			})),
		};
	}

	async setAgentFunction(
		userId: string,
		input: SetAgentFunctionInput,
	): Promise<AgentFunctionsSettings> {
		await this.assertManager(userId);

		if (!isAgentFunction(input.id)) {
			throw new BadRequestException(
				`There is no agent function called "${input.id}".`,
			);
		}

		await writeAgentFunction(this.db, input.id, input.enabled);

		this.logger.log({
			message: "Agent function switched",
			agentFunction: input.id,
			enabled: input.enabled,
		});

		return this.agentFunctions(userId);
	}

	async draftStyle(): Promise<DraftStyleOutput> {
		const style = await readDraftStyle(this.db);
		return { rules: style.rules, max: DRAFT_STYLE.maxRules };
	}

	async forgetDraftStyleRule(
		userId: string,
		ruleId: string,
	): Promise<DraftStyleOutput> {
		await this.assertManager(userId);
		const style = await readDraftStyle(this.db);
		await writeDraftStyle(this.db, withoutDraftStyleRule(style, ruleId));

		this.logger.log({ message: "Draft style rule removed", ruleId });

		return this.draftStyle();
	}

	async dealStages(userId: string): Promise<DealStagesSettings> {
		const [names, role] = await Promise.all([
			readDealStageNames(this.db),
			workspaceRoleOf(userId, this.db),
		]);

		return {
			canRename: canRenameWorkspace(role),
			stages: DEAL_STAGES.map((stage) => ({
				stage,
				name: names[stage] ?? null,
			})),
		};
	}

	async setDealStageName(
		userId: string,
		input: SetDealStageNameInput,
	): Promise<DealStagesSettings> {
		if (!canRenameWorkspace(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a workspace admin can rename a pipeline stage.",
			);
		}

		const names = await readDealStageNames(this.db);
		const name = input.name?.trim();

		await writeDealStageNames(this.db, {
			...names,
			[input.stage]: name || undefined,
		});

		this.logger.log({
			message: "Deal stage renamed",
			stage: input.stage,
			named: Boolean(name),
		});

		return this.dealStages(userId);
	}
}
