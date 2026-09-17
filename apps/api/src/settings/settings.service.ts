import {
	hasPassword,
	isPasswordSignInConfigured,
	isWorkspaceAdmin,
	PASSWORD_RULES,
	type PasswordRefusal,
	PasswordRefused,
	setPasswordFor,
	workspaceRoleOf,
} from "@crm/auth";
import { isFreshPasswordSession } from "@crm/auth/password-rules";
import type { Db } from "@crm/db";
import { USAGE_PROBE_KIND } from "@crm/db/agent-tasks";
import { readModelSpend } from "@crm/db/model-spend";
import { isPlanId, limitsOf, PLAN_IDS, PLANS } from "@crm/db/plans";
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
	readContextDevKey,
	readingModelFor,
	readPlan,
	readResearchKeySkipped,
	writeAgentProvider,
	writeArchiveRetentionDays,
	writeContextDevKey,
	writeResearchKeySkipped,
} from "@crm/db/settings";
import {
	AGENT_FUNCTIONS,
	isAgentFunction,
	isAgentFunctionEnabled,
	readAgentFunctions,
	writeAgentFunction,
} from "@crm/validation/agent-functions";
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
import { BackfillService } from "../backfill/backfill.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { SETTINGS } from "./settings.config";
import type {
	AgentFunctionsSettings,
	AgentProviderSettings,
	ArchiveRetentionSettings,
	ChatgptLoginSettings,
	DraftStyleOutput,
	PasswordSignInSettings,
	PlanSettings,
	ResearchKeySettings,
	SetAgentFunctionInput,
	SetAgentProviderInput,
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
		private readonly backfill: BackfillService,
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

	async refreshUsage(userId: string): Promise<AgentProviderSettings> {
		await this.assertManager(userId);
		await this.agent.usageProbeRequested();
		return this.agentProvider();
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
		sessionCreatedAt: Date,
		sessionId: string,
	): Promise<PasswordSignInSettings> {
		if (!isFreshPasswordSession(sessionCreatedAt)) {
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
		const plan = await readPlan(this.db);
		const limits = limitsOf(plan);

		return {
			plan: isPlanId(plan) ? plan : null,
			label: limits.label,
			limits: {
				contacts: limits.contacts,
				mailboxes: limits.mailboxes,
				importMonths: limits.importMonths,
				researchPerHour: limits.researchPerHour,
				companyResearch: limits.companyResearch,
				insightsPerMonth: limits.insightsPerMonth,
			},
			options: PLAN_IDS.map((id) => ({ id, label: PLANS[id].label })),
		};
	}

	async spend(): Promise<SpendSettings> {
		const days = SETTINGS.spend.days;
		const since = new Date(Date.now() - days * SETTINGS.spend.dayMs);
		const report = await readModelSpend(this.db, since);

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
		const setting = await readAgentProvider(this.db);
		const [usage, probe] = await Promise.all([
			setting.provider === "chatgpt"
				? readProviderUsage(this.db, "chatgpt")
				: null,
			setting.provider === "chatgpt" ? this.usageProbe() : null,
		]);

		return {
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

	async setAgentProvider(
		userId: string,
		input: SetAgentProviderInput,
	): Promise<AgentProviderSettings> {
		await this.assertManager(userId);
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
		return this.researchKeys.chatgptLogin(action);
	}

	private openrouterEnvKey(): boolean {
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

	async researchKey(): Promise<ResearchKeySettings> {
		const [key, skipped] = await Promise.all([
			readContextDevKey(this.db),
			readResearchKeySkipped(this.db),
		]);

		return {
			configured: key !== null,
			hint: key ? maskKey(key) : null,
			skipped,
		};
	}

	async proposeBusiness(userId: string): Promise<{ queued: boolean }> {
		await this.assertManager(userId);
		return { queued: await this.agent.businessSetupRequested(true) };
	}

	async skipResearchKey(userId: string): Promise<ResearchKeySettings> {
		await this.assertManager(userId);
		await writeResearchKeySkipped(this.db);
		this.logger.log({
			message: "Context key skipped; the agent reads company websites itself",
		});

		void this.backfill.run("companies").catch(() => undefined);

		return this.researchKey();
	}

	async setResearchKey(
		userId: string,
		apiKey: string,
	): Promise<ResearchKeySettings> {
		await this.assertManager(userId);
		const check = await this.researchKeys.verify(apiKey);

		if (check.outcome === "invalid") {
			throw new BadRequestException(check.reason);
		}

		await writeContextDevKey(this.db, apiKey);

		this.logger.log({
			message: "Context key saved",
			verified: check.outcome === "valid",
		});

		// Every company added while there was no key is still PENDING, because a
		// brand task with nowhere to look leaves the record alone. The sign-in
		// sweep would find them, but the person who just fixed it is standing
		// here — so pick the work up now rather than on their next sign-in.
		void this.backfill
			.run("companies")
			.then(({ queued, remaining }) => {
				if (queued > 0) {
					this.logger.log({
						message: "Queued the research that was waiting on a key",
						queued,
						remaining,
					});
				}
			})
			.catch((cause: unknown) => {
				this.logger.warn(
					{ message: "Could not queue the waiting research" },
					cause instanceof Error ? cause.stack : String(cause),
				);
			});

		return this.researchKey();
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
}
