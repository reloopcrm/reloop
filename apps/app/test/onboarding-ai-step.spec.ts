import { describe, expect, it } from "bun:test";
import { AI_STEP, aiStepFor } from "../app/(landing)/onboarding/ai/ai-config";

describe("which AI step the onboarding shows", () => {
	it("skips the step on a hosted plan with included AI", () => {
		expect(aiStepFor({ hosted: true, fixed: true })).toBe("hidden");
	});

	it("offers only API keys on a hosted own-key plan", () => {
		expect(aiStepFor({ hosted: true, fixed: false })).toBe("keys-only");
		expect(AI_STEP.choices["keys-only"]).not.toContain("chatgpt");
		expect(AI_STEP.choices["keys-only"]).toEqual([
			"openai",
			"anthropic",
			"openrouter",
		]);
	});

	it("keeps all three choices on a single-tenant install", () => {
		expect(aiStepFor({ hosted: false, fixed: false })).toBe("all");
		expect(AI_STEP.choices.all).toEqual(["openai", "anthropic", "chatgpt"]);
	});
});
