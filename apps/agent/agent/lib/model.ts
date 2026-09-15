import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@crm/db";
import { USAGE_PROBE_OUTCOMES } from "@crm/db/agent-tasks";
import {
	type ProviderUsageSnapshot,
	readProviderUsage,
	usageFromCodexHeaders,
	writeProviderUsage,
} from "@crm/db/provider-usage";
import { appSecretKey, openSecret } from "@crm/db/secrets";
import {
	AGENT_PROVIDER_DEFAULTS,
	type AgentProvider,
	type AgentProviderSetting,
	draftModelFor,
	readAgentModel,
	readAgentProvider,
	readingModelFor,
} from "@crm/db/settings";
import {
	gateway,
	type LanguageModel,
	type LanguageModelMiddleware,
	streamText,
	wrapLanguageModel,
} from "ai";
import { experimental_chatgpt } from "eve/models/openai";
import { z } from "zod";
import { MODEL } from "./model-config";
import { withSpendMeter } from "./spend-meter";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

type ModelObject = Exclude<LanguageModel, string>;

export interface StepModelSelection {
	model: ModelObject;
	modelContextWindowTokens: number;
}

export type ModelCandidate = {
	provider: AgentProvider;
	label: string;
	model: string;
	contextWindowTokens: number;
	build: () => ModelObject;
};

let cached: { at: number; setting: AgentProviderSetting } | null = null;

const exhaustedUntil = new Map<AgentProvider, number>();

async function provider(): Promise<AgentProviderSetting> {
	const now = Date.now();
	if (cached && now - cached.at < MODEL.provider.cacheMs) return cached.setting;

	const setting = await readAgentProvider(db);
	cached = { at: now, setting };
	return setting;
}

export function forgetProviderCache(): void {
	cached = null;
	exhaustedUntil.clear();
}

function openKey(sealed: string | null): string | null {
	if (!sealed) return null;
	try {
		return openSecret(sealed, appSecretKey(MODEL.secrets.purpose));
	} catch (error) {
		console.error(
			`[agent] a stored provider key could not be read: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export type ModelPurpose = "chat" | "reading" | "draft";

function purposeModel(
	setting: AgentProviderSetting,
	purpose: ModelPurpose,
): string {
	if (purpose === "reading") return readingModelFor(setting);
	if (purpose === "draft") return draftModelFor(setting);
	return "";
}

export function candidatesFor(
	setting: AgentProviderSetting,
	env: NodeJS.ProcessEnv = process.env,
	purpose: ModelPurpose = "chat",
	kind: string = MODEL.spend.defaultKind,
): ModelCandidate[] {
	const all: ModelCandidate[] = [];

	const openaiKey = openKey(setting.openaiKey);
	const anthropicKey = openKey(setting.anthropicKey);
	const gatewayKey = env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN;
	const wanted = purposeModel(setting, purpose);
	const modelFor = (provider: AgentProvider, fallback: string) =>
		wanted && setting.provider === provider ? wanted : fallback;

	const chatgptModel = modelFor("chatgpt", setting.chatgptModel);
	all.push({
		provider: "chatgpt",
		label: `ChatGPT subscription (${chatgptModel})`,
		model: chatgptModel,
		contextWindowTokens: AGENT_PROVIDER_DEFAULTS.chatgpt.contextWindowTokens,
		build: () =>
			withSpendMeter(
				withUsageCapture(experimental_chatgpt(chatgptModel) as ModelObject),
				chatgptModel,
				kind,
			),
	});

	if (openaiKey) {
		const openaiModel = modelFor("openai", setting.openaiModel);
		all.push({
			provider: "openai",
			label: `OpenAI API (${openaiModel})`,
			model: openaiModel,
			contextWindowTokens: AGENT_PROVIDER_DEFAULTS.openai.contextWindowTokens,
			build: () =>
				withSpendMeter(
					createOpenAI({ apiKey: openaiKey })(openaiModel),
					openaiModel,
					kind,
				),
		});
	}

	if (anthropicKey) {
		const anthropicModel = modelFor("anthropic", setting.anthropicModel);
		all.push({
			provider: "anthropic",
			label: `Anthropic API (${anthropicModel})`,
			model: anthropicModel,
			contextWindowTokens:
				AGENT_PROVIDER_DEFAULTS.anthropic.contextWindowTokens,
			build: () =>
				withSpendMeter(
					createAnthropic({ apiKey: anthropicKey })(anthropicModel),
					anthropicModel,
					kind,
				),
		});
	}

	if (gatewayKey) {
		all.push({
			provider: "gateway",
			label: "Vercel AI Gateway",
			model: MODEL.gateway.fallbackModel,
			contextWindowTokens: 0,
			build: () =>
				withSpendMeter(
					gateway(MODEL.gateway.fallbackModel) as ModelObject,
					MODEL.gateway.fallbackModel,
					kind,
				),
		});
	}

	const chosen = all.filter((entry) => entry.provider === setting.provider);
	const rest = all.filter((entry) => entry.provider !== setting.provider);

	return [...chosen, ...rest];
}

const usageHeaders = z
	.record(
		z.string(),
		z.union([z.string(), z.number().transform(String)]).catch(""),
	)
	.transform((headers) =>
		Object.fromEntries(
			Object.entries(headers).filter(([, value]) => value.length > 0),
		),
	)
	.catch({});

const vendorStatus = z
	.object({ statusCode: z.coerce.number().catch(Number.NaN).optional() })
	.catch({});

const vendorHeaders = z
	.object({ responseHeaders: usageHeaders.optional() })
	.catch({});

const modelResponse = z
	.object({
		response: z.object({ headers: usageHeaders.optional() }).optional(),
	})
	.catch({});

type UsageHeaders = z.infer<typeof usageHeaders>;
type VendorStatus = z.infer<typeof vendorStatus>;
type VendorHeaders = z.infer<typeof vendorHeaders>;

export type ProviderFailure = {
	statusCode: number | null;
	message: string;
	responseHeaders: UsageHeaders;
};

function headersOf(cause: unknown): UsageHeaders {
	try {
		const headers: VendorHeaders = vendorHeaders.parse(cause);
		return headers.responseHeaders ?? {};
	} catch {
		return {};
	}
}

export function readProviderFailure(cause: unknown): ProviderFailure {
	const status: VendorStatus = vendorStatus.parse(cause);
	const code = status.statusCode;

	return {
		statusCode: code === undefined || Number.isNaN(code) ? null : code,
		message: cause instanceof Error ? cause.message : String(cause),
		responseHeaders: headersOf(cause),
	};
}

export function isExhaustion(failure: ProviderFailure): boolean {
	return (
		failure.statusCode === 429 ||
		failure.statusCode === 402 ||
		/usage[ _-]?(limit|exceeded)|rate[ _-]?limit|quota|insufficient|no available credits|credit/i.test(
			failure.message,
		)
	);
}

export function usageFromError(
	failure: ProviderFailure,
): ProviderUsageSnapshot | null {
	return usageFromCodexHeaders(failure.responseHeaders);
}

export function resetTimeFrom(failure: ProviderFailure): number | null {
	const snapshot = usageFromError(failure);
	if (snapshot) {
		void writeProviderUsage(db, snapshot).catch(() => undefined);
	}

	const reset = snapshot?.primaryResetAt?.getTime() ?? null;
	return reset !== null && reset > Date.now() ? reset : null;
}

export function markExhausted(
	name: AgentProvider,
	now = Date.now(),
	until: number | null = null,
): void {
	const resumeTime = until ?? now + MODEL.fallback.cooldownMs;
	exhaustedUntil.set(name, resumeTime);
	console.error(
		`[agent] ${name} reports its usage limit; waiting until ${new Date(resumeTime).toISOString()} before using it again`,
	);
}

export function exhaustedUntilOf(name: AgentProvider): number | null {
	const until = exhaustedUntil.get(name) ?? null;
	return until !== null && until > Date.now() ? until : null;
}

export function usable(
	candidates: ModelCandidate[],
	now = Date.now(),
): ModelCandidate[] {
	return candidates.filter(
		(entry) => (exhaustedUntil.get(entry.provider) ?? 0) <= now,
	);
}

export async function providersExhausted(): Promise<boolean> {
	const setting = await provider();
	if (setting.provider === "gateway") return false;

	return usable(candidatesFor(setting)).length === 0;
}

export async function resumeAt(): Promise<Date | null> {
	const setting = await provider();
	const chain = candidatesFor(setting);
	const times = chain
		.map((entry) => exhaustedUntilOf(entry.provider))
		.filter((value): value is number => value !== null);

	return times.length === chain.length && times.length > 0
		? new Date(Math.min(...times))
		: null;
}

let lastUsageWrite = 0;
let usageWritten: Promise<void> = Promise.resolve();

function recordUsage(headers: UsageHeaders): void {
	const now = Date.now();
	if (now - lastUsageWrite < MODEL.usage.minIntervalMs) return;

	const snapshot = usageFromCodexHeaders(headers);
	if (!snapshot) return;
	lastUsageWrite = now;

	if (
		snapshot.primaryUsedPercent !== null &&
		snapshot.primaryUsedPercent >= 100 &&
		snapshot.primaryResetAt
	) {
		exhaustedUntil.set("chatgpt", snapshot.primaryResetAt.getTime());
	}

	usageWritten = (async () => {
		try {
			await writeProviderUsage(db, snapshot);
		} catch (error) {
			console.error(
				`[agent] could not store the subscription usage: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	})();
}

function withUsageCapture(model: ModelObject): ModelObject {
	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			recordUsage(modelResponse.parse(result).response?.headers ?? {});
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const result = await doStream();
			recordUsage(modelResponse.parse(result).response?.headers ?? {});
			return result;
		},
	};

	return wrapLanguageModel({ model, middleware }) as ModelObject;
}

function withExhaustionMark(
	model: ModelObject,
	name: AgentProvider | undefined,
): ModelObject {
	if (!name) return model;

	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate }) => {
			try {
				return await doGenerate();
			} catch (error) {
				const failure = readProviderFailure(error);
				if (isExhaustion(failure)) {
					markExhausted(name, Date.now(), resetTimeFrom(failure));
				}
				throw error;
			}
		},
		wrapStream: async ({ doStream }) => {
			try {
				return await doStream();
			} catch (error) {
				const failure = readProviderFailure(error);
				if (isExhaustion(failure)) {
					markExhausted(name, Date.now(), resetTimeFrom(failure));
				}
				throw error;
			}
		},
	};

	return wrapLanguageModel({ model, middleware }) as ModelObject;
}

type WrappedModel = ReturnType<typeof wrapLanguageModel>;

function withFallback(
	chain: ModelCandidate[],
	built: ModelObject[],
): ModelObject {
	const primary = built[0];
	if (!primary) throw new Error("No model to wrap.");
	if (chain.length <= 1) return withExhaustionMark(primary, chain[0]?.provider);

	const next = () => withFallback(chain.slice(1), built.slice(1));

	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate, params }) => {
			try {
				return await doGenerate();
			} catch (error) {
				const failure = readProviderFailure(error);
				if (!isExhaustion(failure) || !chain[0]) throw error;
				markExhausted(chain[0].provider, Date.now(), resetTimeFrom(failure));
				const fallback = next() as WrappedModel;
				return fallback.doGenerate(params);
			}
		},
		wrapStream: async ({ doStream, params }) => {
			try {
				return await doStream();
			} catch (error) {
				const failure = readProviderFailure(error);
				if (!isExhaustion(failure) || !chain[0]) throw error;
				markExhausted(chain[0].provider, Date.now(), resetTimeFrom(failure));
				const fallback = next() as WrappedModel;
				return fallback.doStream(params);
			}
		},
	};

	return wrapLanguageModel({ model: primary, middleware }) as ModelObject;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		if ((await provider()).provider !== "gateway") return null;

		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export async function stepModel(
	kind: string = MODEL.spend.researchKind,
): Promise<StepModelSelection | null> {
	try {
		const setting = await provider();
		if (setting.provider === "gateway") return null;

		const chain = usable(candidatesFor(setting, process.env, "chat", kind));
		const first = chain[0];
		if (!first) {
			console.error(
				"[agent] every configured provider is at its usage limit; this call goes to the gateway",
			);
			return null;
		}

		return {
			model: withFallback(
				chain,
				chain.map((entry) => entry.build()),
			),
			modelContextWindowTokens: first.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not build the model for the chosen provider, using the gateway: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

async function chatgptExhausted(): Promise<boolean> {
	if (exhaustedUntilOf("chatgpt") !== null) return true;

	const usage = await readProviderUsage(db, "chatgpt").catch(() => null);
	const used = usage?.primaryUsedPercent ?? null;
	const reset = usage?.primaryResetAt?.getTime() ?? null;

	return used !== null && used >= 100 && reset !== null && reset > Date.now();
}

export async function modelUnavailable(): Promise<string | null> {
	try {
		const setting = await provider();
		if (setting.provider === "gateway") return null;

		const chain = candidatesFor(setting);
		if (chain.some((entry) => entry.provider === "gateway")) return null;

		const spent = await chatgptExhausted();
		const live = usable(chain).filter(
			(entry) => entry.provider !== "chatgpt" || !spent,
		);
		if (live.length > 0) return null;

		const usage = await readProviderUsage(db, "chatgpt").catch(() => null);
		const reset = usage?.primaryResetAt ?? (await resumeAt());
		const days =
			reset === null
				? null
				: Math.max(
						1,
						Math.ceil((reset.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
					);

		return [
			"The ChatGPT subscription has used up its window, and no other provider is set up.",
			days === null
				? "The agent starts again when the limit resets."
				: `The agent starts again when the limit resets in ${days} ${days === 1 ? "day" : "days"}.`,
			"Add an OpenAI or Anthropic key under Settings, General to keep working now.",
		].join(" ");
	} catch {
		return null;
	}
}

export async function directModel(
	purpose: ModelPurpose = "chat",
	kind: string = MODEL.spend.defaultKind,
): Promise<ModelObject> {
	const setting = await provider();

	if (setting.provider !== "gateway") {
		const chain = usable(candidatesFor(setting, process.env, purpose, kind));
		const built = chain.map((entry) => entry.build());
		if (built.length > 0) return withFallback(chain, built);
	}

	const model = await readAgentModel(db);
	return withSpendMeter(gateway(model.id) as ModelObject, model.id, kind);
}

export async function logModelProvider(): Promise<void> {
	try {
		const setting = await readAgentProvider(db);

		if (setting.provider === "gateway") {
			const model = await readAgentModel(db);
			console.error(
				`[agent] on   Model: ${model.id} (Vercel AI Gateway, Settings → General)`,
			);
			return;
		}

		const chain = candidatesFor(setting);
		const labels = chain.map((entry) => entry.label);
		console.error(
			`[agent] on   Model: ${labels[0] ?? setting.provider}${
				labels.length > 1 ? `, falls back to ${labels.slice(1).join(", ")}` : ""
			}`,
		);
	} catch (error) {
		console.error(
			`[agent] off  Model: could not read the setting: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

async function usageStampOf(): Promise<number> {
	const stored = await readProviderUsage(db, "chatgpt");
	return stored?.updatedAt.getTime() ?? 0;
}

export async function probeUsage(): Promise<string> {
	const setting = await provider();
	if (setting.provider !== "chatgpt") {
		return USAGE_PROBE_OUTCOMES.wrongProvider;
	}

	const candidate = candidatesFor(setting, process.env, "reading").find(
		(entry) => entry.provider === "chatgpt",
	);
	if (!candidate) return USAGE_PROBE_OUTCOMES.notSetUp;

	const before = await usageStampOf();
	lastUsageWrite = 0;

	try {
		const result = streamText({
			model: candidate.build(),
			prompt: "OK",
			abortSignal: AbortSignal.timeout(MODEL.usage.probeTimeoutMs),
		});
		for await (const _ of result.textStream) {
		}
	} catch (error) {
		const failure = readProviderFailure(error);
		const snapshot = usageFromError(failure);
		if (snapshot) await writeProviderUsage(db, snapshot);
		if (isExhaustion(failure)) {
			markExhausted("chatgpt", Date.now(), resetTimeFrom(failure));
		}
	}

	await usageWritten;

	return (await usageStampOf()) > before
		? USAGE_PROBE_OUTCOMES.refreshed
		: USAGE_PROBE_OUTCOMES.noLimit;
}
