import { describe, expect, it } from "bun:test";
import {
	AGENT_DRAFT_DEFAULT,
	AGENT_MODEL_OPTIONS,
	AGENT_PROVIDER_DEFAULTS,
	AGENT_READING_DEFAULT,
} from "../src/settings";

const PRICED = new Set([
	"gpt-6-astra",
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

	it("never makes the dearest model the one a new install starts on", () => {
		expect(AGENT_PROVIDER_DEFAULTS.chatgpt.model).not.toBe("gpt-6-astra");
		expect(AGENT_READING_DEFAULT.chatgpt).not.toBe("gpt-6-astra");
	});
});
