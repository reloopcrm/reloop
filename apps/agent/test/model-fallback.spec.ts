import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma } from "@crm/db";
import type { AgentProviderSetting } from "@crm/db/settings";
import {
	candidatesFor,
	isExhaustion as exhausted,
	exhaustedUntilOf,
	forgetProviderCache,
	markExhausted,
	readProviderFailure,
	resetTimeFrom as resetFrom,
	usable,
	usageFromError as usageFrom,
} from "../agent/lib/model";
import { fakeCodexHome } from "./codex-home";

const isExhaustion = (cause: unknown) => exhausted(readProviderFailure(cause));
const usageFromError = (cause: unknown) =>
	usageFrom(readProviderFailure(cause));
const resetTimeFrom = (cause: unknown) => resetFrom(readProviderFailure(cause));

const setting: AgentProviderSetting = {
	provider: "chatgpt",
	openrouterModel: "openai/gpt-5.6-luna",
	chatgptModel: "gpt-5.6-sol",
	openaiModel: "gpt-5.6-terra",
	anthropicModel: "claude-haiku-4-5",
	openrouterKey: null,
	openaiKey: null,
	anthropicKey: null,
	researchPerHour: null,
	readingModel: null,
	draftModel: null,
};

let savedUsage: Prisma.ProviderUsageUncheckedCreateInput | null = null;

const signedIn = fakeCodexHome(true);
const signedOut = fakeCodexHome(false);
const withLogin = { CODEX_HOME: signedIn.home };
const withoutLogin = { CODEX_HOME: signedOut.home };

beforeAll(async () => {
	if (!process.env.DATABASE_URL) return;
	savedUsage = await db.providerUsage.findUnique({
		where: { provider: "chatgpt" },
	});
});

afterAll(async () => {
	signedOut.restore();
	signedIn.restore();
	if (!process.env.DATABASE_URL) return;
	await new Promise((settle) => setTimeout(settle, 200));
	await db.providerUsage.deleteMany({ where: { provider: "chatgpt" } });
	if (savedUsage) await db.providerUsage.create({ data: savedUsage });
});

describe("provider chain", () => {
	it("puts the chosen provider first and only lists configured fallbacks", () => {
		forgetProviderCache();
		const chain = candidatesFor(setting, {
			...withLogin,
			OPENROUTER_API_KEY: "sk-or-test",
		});

		expect(chain.map((entry) => entry.provider)).toEqual([
			"chatgpt",
			"openrouter",
		]);

		const none = candidatesFor(setting, withLogin);
		expect(none.map((entry) => entry.provider)).toEqual(["chatgpt"]);
	});

	it("lists ChatGPT only when a codex login exists on this machine", () => {
		expect(candidatesFor(setting, withoutLogin)).toEqual([]);
		expect(
			candidatesFor(setting, {
				...withoutLogin,
				OPENROUTER_API_KEY: "sk-or-test",
			}).map((entry) => entry.provider),
		).toEqual(["openrouter"]);
	});

	it("sends OpenRouter through the chat completions endpoint", () => {
		const chain = candidatesFor(
			{ ...setting, provider: "openrouter" },
			{ ...withoutLogin, OPENROUTER_API_KEY: "sk-or-test" },
		);
		const first = chain[0];

		expect(first?.provider).toBe("openrouter");
		expect(first?.model).toBe("openai/gpt-5.6-luna");
		expect(first?.build().provider).toBe("openrouter.chat");
	});

	it("skips a provider for the cooldown after it reports a usage limit", () => {
		forgetProviderCache();
		const chain = candidatesFor(setting, {
			...withLogin,
			OPENROUTER_API_KEY: "sk-or-test",
		});
		const now = Date.now();

		markExhausted("chatgpt", now);

		expect(usable(chain, now).map((entry) => entry.provider)).toEqual([
			"openrouter",
		]);
		expect(
			usable(chain, now + 16 * 60_000).map((entry) => entry.provider),
		).toEqual(["chatgpt", "openrouter"]);
		forgetProviderCache();
	});

	it("recognises usage limits, credit and rate limit errors", () => {
		expect(isExhaustion(new Error("The usage limit has been reached"))).toBe(
			true,
		);
		expect(
			isExhaustion(
				Object.assign(new Error("Too many requests"), { statusCode: 429 }),
			),
		).toBe(true);
		expect(isExhaustion(new Error("insufficient_quota"))).toBe(true);
		expect(isExhaustion(new Error("Invalid JSON in tool call"))).toBe(false);
	});

	it("recognises the shapes the ChatGPT subscription sends", () => {
		for (const message of [
			"401 USAGE_EXCEEDED",
			"usage_exceeded",
			"Usage-Exceeded",
			"RATE_LIMIT_EXCEEDED",
			"rate_limit",
		]) {
			expect(isExhaustion(new Error(message))).toBe(true);
		}

		for (const message of [
			"Codex login state was not found",
			"The model returned an empty answer",
			"usage statistics are unavailable",
		]) {
			expect(isExhaustion(new Error(message))).toBe(false);
		}
	});

	it("waits until the reset time the limit error reports", () => {
		forgetProviderCache();
		const resetAt = Math.floor(Date.now() / 1_000) + 3_600;
		const error = Object.assign(new Error("The usage limit has been reached"), {
			statusCode: 429,
			responseHeaders: {
				"x-codex-primary-used-percent": "100",
				"x-codex-primary-reset-at": String(resetAt),
				"x-codex-primary-window-minutes": "300",
			},
		});

		const until = resetTimeFrom(error);
		expect(until).toBe(resetAt * 1_000);

		markExhausted("chatgpt", Date.now(), until);
		expect(exhaustedUntilOf("chatgpt")).toBe(resetAt * 1_000);
		expect(resetTimeFrom(new Error("no headers"))).toBeNull();
		forgetProviderCache();
	});
});

describe("isExhaustion reads the status the vendor sends", () => {
	it("accepts a numeric statusCode of 429 or 402", () => {
		expect(isExhaustion({ statusCode: 429 })).toBe(true);
		expect(isExhaustion({ statusCode: 402 })).toBe(true);
		expect(isExhaustion({ statusCode: 500 })).toBe(false);
	});

	it("accepts a statusCode that arrives as a string", () => {
		expect(isExhaustion({ statusCode: "429" })).toBe(true);
		expect(isExhaustion({ statusCode: "402" })).toBe(true);
		expect(isExhaustion({ statusCode: "500" })).toBe(false);
		expect(isExhaustion({ statusCode: "not a number" })).toBe(false);
	});

	it("ignores a field named status", () => {
		expect(isExhaustion({ status: 429 })).toBe(false);
		expect(isExhaustion({ status: "429" })).toBe(false);
		expect(
			isExhaustion(
				Object.assign(new Error("Too many requests"), { status: 429 }),
			),
		).toBe(false);
	});

	it("ignores a status buried in a nested error body", () => {
		expect(isExhaustion({ error: { statusCode: 429 } })).toBe(false);
		expect(isExhaustion({ response: { statusCode: 429 } })).toBe(false);
		expect(
			isExhaustion({ data: { error: { message: "rate limit reached" } } }),
		).toBe(false);
	});

	it("treats a missing, null or undefined statusCode as no status", () => {
		expect(isExhaustion({})).toBe(false);
		expect(isExhaustion({ statusCode: null })).toBe(false);
		expect(isExhaustion({ statusCode: undefined })).toBe(false);
		expect(isExhaustion({ statusCode: {} })).toBe(false);
	});

	it("reads the message of an Error and the value of anything else", () => {
		expect(isExhaustion(new Error("Bad gateway"))).toBe(false);
		expect(isExhaustion(new Error("You have no available credits"))).toBe(true);
		expect(
			isExhaustion(
				Object.assign(new Error("quota exceeded"), { statusCode: 500 }),
			),
		).toBe(true);
	});

	it("reads a thrown string", () => {
		expect(isExhaustion("rate limit exceeded")).toBe(true);
		expect(isExhaustion("insufficient funds")).toBe(true);
		expect(isExhaustion("connection reset")).toBe(false);
	});

	it("never reads a plain object as its message", () => {
		expect(isExhaustion({ message: "rate limit reached" })).toBe(false);
		expect(
			isExhaustion({ message: "rate limit reached", statusCode: 429 }),
		).toBe(true);
	});

	it("reads the status without touching the rest of the error", () => {
		const error = new Error("Too many requests");
		Object.defineProperty(error, "statusCode", {
			value: 429,
			enumerable: true,
		});
		Object.defineProperty(error, "responseHeaders", {
			enumerable: true,
			get() {
				throw new Error("header access exploded");
			},
		});

		expect(isExhaustion(error)).toBe(true);
	});

	it("says no for null, undefined and an empty array", () => {
		expect(isExhaustion(null)).toBe(false);
		expect(isExhaustion(undefined)).toBe(false);
		expect(isExhaustion([])).toBe(false);
		expect(isExhaustion(0)).toBe(false);
	});
});

describe("usageFromError reads the usage headers the vendor sends", () => {
	const resetAt = 1_700_000_000;

	const headers = {
		"x-codex-plan-type": "pro",
		"x-codex-primary-used-percent": "73",
		"x-codex-primary-reset-at": String(resetAt),
		"x-codex-primary-window-minutes": "300",
		"x-codex-secondary-used-percent": "12",
		"x-codex-secondary-reset-at": String(resetAt + 60),
		"x-codex-secondary-window-minutes": "10080",
		"x-codex-safety-buffering-faster-model": "gpt-5.6-mini",
	};

	it("reads a plain object of headers", () => {
		expect(usageFromError({ responseHeaders: headers })).toEqual({
			provider: "chatgpt",
			planType: "pro",
			primaryUsedPercent: 73,
			primaryResetAt: new Date(resetAt * 1_000),
			primaryWindowMinutes: 300,
			secondaryUsedPercent: 12,
			secondaryResetAt: new Date((resetAt + 60) * 1_000),
			secondaryWindowMinutes: 10_080,
			fasterModel: "gpt-5.6-mini",
		});
	});

	it("reads the headers off an Error the vendor threw", () => {
		const error = Object.assign(new Error("Too many requests"), {
			statusCode: 429,
			responseHeaders: { "x-codex-primary-used-percent": "100" },
		});

		expect(usageFromError(error)).toEqual({
			provider: "chatgpt",
			planType: null,
			primaryUsedPercent: 100,
			primaryResetAt: null,
			primaryWindowMinutes: null,
			secondaryUsedPercent: null,
			secondaryResetAt: null,
			secondaryWindowMinutes: null,
			fasterModel: null,
		});
	});

	it("reads nothing from a Headers instance", () => {
		expect(
			usageFromError({ responseHeaders: new Headers(headers) }),
		).toBeNull();
	});

	it("reads nothing from header names in another case", () => {
		expect(
			usageFromError({
				responseHeaders: { "X-Codex-Primary-Used-Percent": "73" },
			}),
		).toBeNull();
	});

	it("says nothing when the used percent is missing or unreadable", () => {
		expect(usageFromError({ responseHeaders: {} })).toBeNull();
		expect(
			usageFromError({ responseHeaders: { "x-codex-plan-type": "pro" } }),
		).toBeNull();
		expect(
			usageFromError({
				responseHeaders: { "x-codex-primary-used-percent": "unreadable" },
			}),
		).toBeNull();
	});

	it("says nothing when there are no headers at all", () => {
		expect(usageFromError({})).toBeNull();
		expect(usageFromError({ responseHeaders: null })).toBeNull();
		expect(usageFromError({ responseHeaders: undefined })).toBeNull();
		expect(usageFromError({ responseHeaders: "nothing here" })).toBeNull();
		expect(usageFromError(new Error("plain"))).toBeNull();
		expect(usageFromError(null)).toBeNull();
		expect(usageFromError(undefined)).toBeNull();
		expect(usageFromError("a thrown string")).toBeNull();
	});
});

describe("resetTimeFrom only reports a reset that is still ahead", () => {
	it("reports nothing when the reset time has already passed", () => {
		const past = Math.floor(Date.now() / 1_000) - 3_600;
		const error = Object.assign(new Error("The usage limit has been reached"), {
			statusCode: 429,
			responseHeaders: {
				"x-codex-primary-used-percent": "50",
				"x-codex-primary-reset-at": String(past),
			},
		});

		expect(resetTimeFrom(error)).toBeNull();
	});

	it("reports nothing when the headers carry no reset time", () => {
		expect(
			resetTimeFrom({
				responseHeaders: { "x-codex-primary-used-percent": "50" },
			}),
		).toBeNull();
	});

	it("reports nothing for a value that carries no headers", () => {
		expect(resetTimeFrom(null)).toBeNull();
		expect(resetTimeFrom(undefined)).toBeNull();
		expect(resetTimeFrom("a thrown string")).toBeNull();
		expect(resetTimeFrom({})).toBeNull();
	});
});

describe("a header the vendor leaves out stays empty", () => {
	it("reports no plan type when the header is absent", () => {
		expect(
			usageFromError({
				responseHeaders: {
					"x-codex-primary-used-percent": "50",
					"x-codex-plan-type": undefined,
				},
			})?.planType,
		).toBeNull();
	});

	it("reports no plan type when the header is null", () => {
		expect(
			usageFromError({
				responseHeaders: {
					"x-codex-primary-used-percent": "50",
					"x-codex-plan-type": null,
				},
			})?.planType,
		).toBeNull();
	});

	it("reports no faster model when that header is absent", () => {
		expect(
			usageFromError({
				responseHeaders: {
					"x-codex-primary-used-percent": "50",
					"x-codex-safety-buffering-faster-model": undefined,
				},
			})?.fasterModel,
		).toBeNull();
	});
});
