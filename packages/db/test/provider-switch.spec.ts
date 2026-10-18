import { describe, expect, it } from "bun:test";
import { modelsAfterSwitch } from "../src/settings";

const stored = {
	provider: "anthropic",
	readingModel: "claude-haiku-4-5",
	draftModel: "claude-sonnet-5",
} as const;

describe("the mail models on a provider switch", () => {
	it("drops a reading and a draft model carried over from the old provider", () => {
		expect(
			modelsAfterSwitch(stored, {
				provider: "openrouter",
				readingModel: "claude-haiku-4-5",
				draftModel: "claude-sonnet-5",
			}),
		).toEqual({ readingModel: null, draftModel: null });
	});

	it("resets both when the switch names no model at all", () => {
		expect(modelsAfterSwitch(stored, { provider: "chatgpt" })).toEqual({
			readingModel: null,
			draftModel: null,
		});
	});

	it("keeps a model chosen for the new provider", () => {
		expect(
			modelsAfterSwitch(stored, {
				provider: "openrouter",
				readingModel: "openai/gpt-5.6-terra",
				draftModel: "claude-sonnet-5",
			}),
		).toEqual({ readingModel: "openai/gpt-5.6-terra", draftModel: null });
	});

	it("leaves everything alone when the provider stays", () => {
		expect(
			modelsAfterSwitch(stored, {
				provider: "anthropic",
				readingModel: "claude-haiku-4-5",
			}),
		).toEqual({ readingModel: "claude-haiku-4-5", draftModel: undefined });
	});
});
