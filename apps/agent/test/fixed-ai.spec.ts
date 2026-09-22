import { describe, expect, it } from "bun:test";
import type { AgentProviderSetting } from "@crm/db/settings";
import type { LanguageModel } from "ai";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { inLane, type KeyBucket, type Lane } from "../agent/lib/key-bucket";
import {
	candidatesFor,
	fallbackModel,
	fixedCandidates,
	openrouterKeyOf,
	pinnedBody,
} from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";
import { rotated, tenantTool } from "../agent/lib/tenant";

describe("the fixed AI chain", () => {
	it("is one OpenRouter candidate on the operator key, by purpose", () => {
		const env = { OPENROUTER_API_KEY: "sk-or-operator" };

		const chat = fixedCandidates(env, "chat");
		const reading = fixedCandidates(env, "reading");
		const draft = fixedCandidates(env, "draft");

		expect(chat.map((entry) => entry.provider)).toEqual(["openrouter"]);
		expect(chat[0]?.model).toBe("openai/gpt-5.6-luna");
		expect(reading[0]?.model).toBe("openai/gpt-5.6-luna");
		expect(draft[0]?.model).toBe("openai/gpt-5.6-sol");
	});

	it("pins Sol to the standard OpenAI route on OpenRouter", () => {
		const body = JSON.stringify({ model: "openai/gpt-5.6-sol", messages: [] });
		expect(JSON.parse(pinnedBody("openai/gpt-5.6-sol", body))).toMatchObject({
			provider: { order: ["openai"], allow_fallbacks: false },
		});
		expect(pinnedBody("openai/gpt-5.6-luna", body)).toBe(body);
	});

	it("has no candidate without the operator key", () => {
		expect(fixedCandidates({}, "chat")).toEqual([]);
		expect(fixedCandidates({ OPENROUTER_API_KEY: "  " }, "draft")).toEqual([]);
	});

	it("sends the compiled fallback through the shared key bucket before any request", async () => {
		const taken: Lane[] = [];
		const bucket = {
			take: (lane: Lane) => {
				taken.push(lane);
				throw new Error("bucket consulted");
			},
		} as unknown as KeyBucket;
		const model = fallbackModel(() => bucket) as Exclude<LanguageModel, string>;

		await expect(model.doGenerate({ prompt: [] } as never)).rejects.toThrow(
			"bucket consulted",
		);
		await expect(
			inLane("slow", () => model.doStream({ prompt: [] } as never)),
		).rejects.toThrow("bucket consulted");
		expect(taken).toEqual(["fast", "slow"]);
	});

	it("recognises vendor words in an error a customer would read", () => {
		const words = MODEL.fixed.vendorWords;
		for (const text of [
			"OpenRouter answered 402",
			"gpt-5.6-sol is not available",
			"No model provider is set up",
			"The API key was rejected",
			"anthropic/claude-sonnet-5 overloaded",
		]) {
			expect(words.test(text)).toBe(true);
		}
		expect(words.test("No such contact.")).toBe(false);
		expect(MODEL.fixed.unavailable).not.toMatch(words);
		expect(MODEL.fixed.busy).not.toMatch(words);
	});
});

describe("the tenant wrappers in single mode", () => {
	it("passes a tool call through unchanged", async () => {
		const tool = tenantTool(
			defineTool({
				description: "adds one",
				inputSchema: z.object({ n: z.number() }),
				execute: async ({ n }) => n + 1,
			}),
		);
		expect(await tool.execute({ n: 1 }, {} as never)).toBe(2);
	});

	it("rotates the start of the tenant list", () => {
		expect(rotated(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
		expect(rotated(["a", "b", "c"], 1)).toEqual(["b", "c", "a"]);
		expect(rotated(["a", "b", "c"], 5)).toEqual(["c", "a", "b"]);
		expect(rotated([], 3)).toEqual([]);
	});
});

describe("the operator's OpenRouter key on an own-key plan", () => {
	const setting: AgentProviderSetting = {
		provider: "openrouter",
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
	const env = {
		OPENROUTER_API_KEY: "sk-or-operator",
		CODEX_HOME: "/nonexistent",
	};

	it("is never read on a hosted install", () => {
		const saved = process.env.RELOOP_REGISTRY_URL;
		process.env.RELOOP_REGISTRY_URL = "http://registry.test";
		try {
			expect(openrouterKeyOf(setting, env)).toBeNull();
			expect(candidatesFor(setting, env)).toEqual([]);
		} finally {
			if (saved === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = saved;
		}
	});

	it("still serves a single-tenant install", () => {
		expect(openrouterKeyOf(setting, env)).toBe("sk-or-operator");
		expect(candidatesFor(setting, env).map((entry) => entry.provider)).toEqual([
			"openrouter",
		]);
	});
});
