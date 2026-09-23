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
	chatModelFor,
	draftModelFor,
	readAgentProvider,
	readingModelFor,
} from "@crm/db/settings";
import { currentTenant, isHostedCustomer } from "@crm/db/tenant-context";
import {
	type LanguageModel,
	type LanguageModelMiddleware,
	streamText,
	wrapLanguageModel,
} from "ai";
import { experimental_chatgpt } from "eve/models/openai";
import { z } from "zod";
import { chatgptLoginExists } from "./codex-binary";
import {
	type KeyBucket,
	keyBucket,
	type SharedKeyTenant,
	withKeyBucket,
} from "./key-bucket";
import { MODEL } from "./model-config";
import { fixedAi } from "./plan-limits";
import { withSpendMeter } from "./spend-meter";
import { tenantState } from "./tenant";

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

type ProviderRead = { setting: AgentProviderSetting; fixed: boolean };

const state = tenantState(() => ({
	cached: null as { at: number; read: ProviderRead } | null,
	exhaustedUntil: new Map<AgentProvider, number>(),
	lastUsageWrite: 0,
	usageWritten: Promise.resolve() as Promise<void>,
}));

async function provider(): Promise<ProviderRead> {
	const now = Date.now();
	const current = state();
	if (current.cached && now - current.cached.at < MODEL.provider.cacheMs) {
		return current.cached.read;
	}

	const [setting, fixed] = await Promise.all([
		readAgentProvider(db),
		fixedAi(),
	]);
	const read = { setting, fixed };
	current.cached = { at: now, read };
	return read;
}

export function forgetProviderCache(): void {
	const current = state();
	current.cached = null;
	current.exhaustedUntil.clear();
}

export function fixedCandidates(
	env: NodeJS.ProcessEnv = process.env,
	purpose: ModelPurpose = "chat",
	kind: string = MODEL.spend.defaultKind,
): ModelCandidate[] {
	const key = env.OPENROUTER_API_KEY?.trim();
	if (!key) return [];

	const model = MODEL.fixed[purpose];
	return [
		{
			provider: MODEL.fixed.provider,
			label: `Included AI (${model})`,
			model,
			contextWindowTokens: MODEL.fixed.contextWindowTokens,
			build: () =>
				withKeyBucket(
					withSpendMeter(openrouterModel(key, model), model, kind),
					sharedKeyTenant,
				),
		},
	];
}

function sharedKeyTenant(): SharedKeyTenant {
	try {
		const tenant = currentTenant();
		return { id: tenant.id, plan: tenant.plan };
	} catch {
		return { id: null, plan: null };
	}
}

async function chainFor(
	purpose: ModelPurpose = "chat",
	kind: string = MODEL.spend.defaultKind,
): Promise<ModelCandidate[]> {
	const { setting, fixed } = await provider();
	return fixed
		? fixedCandidates(process.env, purpose, kind)
		: candidatesFor(setting, process.env, purpose, kind);
}

export async function publicReason(reason: string): Promise<string> {
	if (!(await fixedAi())) return reason;
	return MODEL.fixed.vendorWords.test(reason)
		? MODEL.fixed.unavailable
		: reason;
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

export function openrouterKeyOf(
	setting: AgentProviderSetting,
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const stored = openKey(setting.openrouterKey);
	if (stored || isHostedCustomer()) return stored;
	return env.OPENROUTER_API_KEY?.trim() || null;
}

const requestBody = z.record(z.string(), z.unknown());

const textBody = z.string();

function pinOf(model: string) {
	return Object.hasOwn(MODEL.openrouter.pins, model)
		? MODEL.openrouter.pins[model as keyof typeof MODEL.openrouter.pins]
		: null;
}

export function pinnedBody(model: string, body: string): string {
	const pin = pinOf(model);
	if (!pin) return body;
	const parsed = requestBody.safeParse(JSON.parse(body));
	return parsed.success
		? JSON.stringify({ ...parsed.data, provider: pin })
		: body;
}

function pinnedFetch(model: string): typeof fetch | undefined {
	if (!pinOf(model)) return undefined;
	return (input, init) => {
		const body = textBody.safeParse(init?.body);
		return fetch(
			input,
			body.success ? { ...init, body: pinnedBody(model, body.data) } : init,
		);
	};
}

export function openrouterModel(apiKey: string, model: string): ModelObject {
	return createOpenAI({
		name: "openrouter",
		baseURL: MODEL.openrouter.baseUrl,
		apiKey,
		headers: MODEL.openrouter.headers,
		fetch: pinnedFetch(model),
	}).chat(model);
}

export function fallbackModel(
	bucket: () => KeyBucket = keyBucket,
): LanguageModel {
	return withKeyBucket(
		openrouterModel(
			process.env.OPENROUTER_API_KEY?.trim() || "unset",
			AGENT_PROVIDER_DEFAULTS.openrouter.model,
		),
		sharedKeyTenant,
		bucket,
	);
}

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
	const openrouterKey = openrouterKeyOf(setting, env);
	const wanted = purposeModel(setting, purpose);
	const modelFor = (provider: AgentProvider, fallback: string) =>
		wanted && setting.provider === provider ? wanted : fallback;

	if (chatgptLoginExists(env)) {
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
	}

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

	if (openrouterKey) {
		const model = modelFor("openrouter", setting.openrouterModel);
		all.push({
			provider: "openrouter",
			label: `OpenRouter (${model})`,
			model,
			contextWindowTokens:
				AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
			build: () =>
				withSpendMeter(openrouterModel(openrouterKey, model), model, kind),
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
	state().exhaustedUntil.set(name, resumeTime);
	console.error(
		`[agent] ${name} reports its usage limit; waiting until ${new Date(resumeTime).toISOString()} before using it again`,
	);
}

export function exhaustedUntilOf(name: AgentProvider): number | null {
	const until = state().exhaustedUntil.get(name) ?? null;
	return until !== null && until > Date.now() ? until : null;
}

export function usable(
	candidates: ModelCandidate[],
	now = Date.now(),
): ModelCandidate[] {
	const { exhaustedUntil } = state();
	return candidates.filter(
		(entry) => (exhaustedUntil.get(entry.provider) ?? 0) <= now,
	);
}

export async function providersExhausted(): Promise<boolean> {
	return usable(await chainFor()).length === 0;
}

export async function resumeAt(): Promise<Date | null> {
	const chain = await chainFor();
	const times = chain
		.map((entry) => exhaustedUntilOf(entry.provider))
		.filter((value): value is number => value !== null);

	return times.length === chain.length && times.length > 0
		? new Date(Math.min(...times))
		: null;
}

function recordUsage(headers: UsageHeaders): void {
	const now = Date.now();
	const current = state();
	if (now - current.lastUsageWrite < MODEL.usage.minIntervalMs) return;

	const snapshot = usageFromCodexHeaders(headers);
	if (!snapshot) return;
	current.lastUsageWrite = now;

	if (
		snapshot.primaryUsedPercent !== null &&
		snapshot.primaryUsedPercent >= 100 &&
		snapshot.primaryResetAt
	) {
		current.exhaustedUntil.set("chatgpt", snapshot.primaryResetAt.getTime());
	}

	current.usageWritten = (async () => {
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

export async function stepModel(
	kind: string = MODEL.spend.researchKind,
): Promise<StepModelSelection | null> {
	try {
		const chain = usable(await chainFor("chat", kind));
		const first = chain[0];
		if (!first) {
			console.error(
				"[agent] every configured provider is at its usage limit; this call goes to the compiled fallback",
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
			`[agent] could not build the model for the chosen provider, using the compiled fallback: ${
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

export const NO_PROVIDER_MESSAGE =
	"No model provider is set up. Add an OpenRouter, OpenAI or Anthropic key under Settings, AI, or sign in with ChatGPT there.";

export async function modelUnavailable(): Promise<string | null> {
	try {
		const { fixed } = await provider();
		const chain = await chainFor();
		if (fixed) {
			if (chain.length === 0) return MODEL.fixed.unavailable;
			return usable(chain).length > 0 ? null : MODEL.fixed.busy;
		}
		if (chain.length === 0) return NO_PROVIDER_MESSAGE;

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
			"Add an OpenRouter, OpenAI or Anthropic key under Settings, AI to keep working now.",
		].join(" ");
	} catch {
		return null;
	}
}

export async function directModel(
	purpose: ModelPurpose = "chat",
	kind: string = MODEL.spend.defaultKind,
): Promise<ModelObject> {
	const { fixed } = await provider();
	const all = await chainFor(purpose, kind);
	if (all.length === 0) {
		throw new Error(fixed ? MODEL.fixed.unavailable : NO_PROVIDER_MESSAGE);
	}

	const chain = usable(all);
	const built = chain.map((entry) => entry.build());
	if (built.length === 0) {
		throw new Error(
			fixed
				? MODEL.fixed.busy
				: "Every configured model provider is at its usage limit; the call waits for the next reset.",
		);
	}

	return withFallback(chain, built);
}

export async function logModelProvider(): Promise<void> {
	try {
		const { setting, fixed } = await provider();
		const chain = await chainFor();
		const labels = chain.map((entry) => entry.label);
		if (fixed) {
			console.error(
				`[agent] on   Model: ${labels[0] ?? "included AI, but OPENROUTER_API_KEY is not set"}`,
			);
			return;
		}
		console.error(
			`[agent] on   Model: ${labels[0] ?? `${chatModelFor(setting).id} (${setting.provider}, no key yet)`}${
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
	const { setting, fixed } = await provider();
	if (fixed || setting.provider !== "chatgpt") {
		return USAGE_PROBE_OUTCOMES.wrongProvider;
	}

	const candidate = candidatesFor(setting, process.env, "reading").find(
		(entry) => entry.provider === "chatgpt",
	);
	if (!candidate) return USAGE_PROBE_OUTCOMES.notSetUp;

	const before = await usageStampOf();
	state().lastUsageWrite = 0;

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

	await state().usageWritten;

	return (await usageStampOf()) > before
		? USAGE_PROBE_OUTCOMES.refreshed
		: USAGE_PROBE_OUTCOMES.noLimit;
}
