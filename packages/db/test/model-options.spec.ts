import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import { priceOf } from "../src/model-prices";
import {
	AGENT_DRAFT_DEFAULT,
	AGENT_MODEL_OPTIONS,
	AGENT_MODEL_SUCCESSORS,
	AGENT_PROVIDER_DEFAULTS,
	AGENT_READING_DEFAULT,
	readAgentProvider,
} from "../src/settings";

const PRICED = new Set([
	"gpt-6-astra",
	"gpt-6.1-sol",
	"gpt-6-sol",
	"gpt-6-luna",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-5.5",
	"claude-opus-5",
	"claude-sonnet-5",
	"claude-haiku-4-5",
]);

const TIERS = ["chatgpt", "openai", "anthropic"] as const;

describe("every model the settings offer", () => {
	for (const tier of TIERS) {
		it(`is a model ${tier} actually sells`, () => {
			const unknown = AGENT_MODEL_OPTIONS[tier]
				.map((option) => option.id)
				.filter((id) => !PRICED.has(id));

			expect(unknown).toEqual([]);
		});

		it(`offers ${tier} at least two choices`, () => {
			expect(AGENT_MODEL_OPTIONS[tier].length).toBeGreaterThanOrEqual(2);
		});
	}
});

describe("every default", () => {
	for (const tier of TIERS) {
		it(`points ${tier} at a model that is on the price list`, () => {
			expect(PRICED.has(AGENT_PROVIDER_DEFAULTS[tier].model)).toBe(true);
			expect(PRICED.has(AGENT_READING_DEFAULT[tier])).toBe(true);
			expect(PRICED.has(AGENT_DRAFT_DEFAULT[tier])).toBe(true);
		});

		it(`picks a ${tier} default the settings also offer`, () => {
			const offered = AGENT_MODEL_OPTIONS[tier].map((option) => option.id);
			expect(offered).toContain(AGENT_PROVIDER_DEFAULTS[tier].model);
			expect(offered).toContain(AGENT_READING_DEFAULT[tier]);
			expect(offered).toContain(AGENT_DRAFT_DEFAULT[tier]);
		});
	}

	it("prices every OpenRouter default so spend rows carry a cost", () => {
		expect(priceOf(AGENT_PROVIDER_DEFAULTS.openrouter.model)).not.toBeNull();
		expect(priceOf(AGENT_READING_DEFAULT.openrouter)).not.toBeNull();
		expect(priceOf(AGENT_DRAFT_DEFAULT.openrouter)).not.toBeNull();
	});

	it("picks OpenRouter defaults the settings also offer", () => {
		const offered = AGENT_MODEL_OPTIONS.openrouter.map((option) => option.id);
		expect(offered.length).toBeGreaterThanOrEqual(2);
		expect(offered).toContain(AGENT_PROVIDER_DEFAULTS.openrouter.model);
		expect(offered).toContain(AGENT_READING_DEFAULT.openrouter);
		expect(offered).toContain(AGENT_DRAFT_DEFAULT.openrouter);
		for (const id of offered) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.:-]+$/);
	});

	it("never makes the dearest model the one a new install starts on", () => {
		expect(AGENT_PROVIDER_DEFAULTS.chatgpt.model).not.toBe("gpt-6-astra");
		expect(AGENT_READING_DEFAULT.chatgpt).not.toBe("gpt-6-astra");
	});
});

describe("a model stored before its successor", () => {
	const dbWith = (row: Record<string, string | null>) =>
		({ appSetting: { findUnique: async () => row } }) as unknown as Db;

	it("reads GPT-6 Sol as GPT-6.1 Sol", async () => {
		const setting = await readAgentProvider(
			dbWith({
				agentProvider: "openrouter",
				agentOpenrouterModel: "openai/gpt-6-sol",
				agentChatgptModel: " gpt-6-sol ",
				agentReadingModel: "openai/gpt-6-luna",
				agentDraftModel: "openai/gpt-6-sol",
			}),
		);

		expect(setting.openrouterModel).toBe("openai/gpt-6.1-sol");
		expect(setting.chatgptModel).toBe("gpt-6.1-sol");
		expect(setting.readingModel).toBe("openai/gpt-6-luna");
		expect(setting.draftModel).toBe("openai/gpt-6.1-sol");
	});

	it("names only successors the settings offer and price", () => {
		const offered: string[] = Object.values(AGENT_MODEL_OPTIONS)
			.flat()
			.map((option) => option.id);

		for (const next of Object.values(AGENT_MODEL_SUCCESSORS)) {
			expect(offered).toContain(next);
			expect(priceOf(next)).not.toBeNull();
		}
	});
});
