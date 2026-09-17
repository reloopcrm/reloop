import { describe, expect, it } from "bun:test";
import { configuredProviders } from "../app/(app)/[slug]/settings/agent-provider-state";

const nothingStored = { openrouter: false, openai: false, anthropic: false };
const nothingTyped = { openrouter: "", openai: "", anthropic: "" };

describe("which providers the settings page counts as configured", () => {
	it("counts ChatGPT only with a codex login on the agent's machine", () => {
		expect(
			configuredProviders({
				stored: nothingStored,
				typed: nothingTyped,
				chatgptLogin: "idle",
			}).chatgpt,
		).toBe(false);
		expect(
			configuredProviders({
				stored: nothingStored,
				typed: nothingTyped,
				chatgptLogin: undefined,
			}).chatgpt,
		).toBe(false);
		expect(
			configuredProviders({
				stored: nothingStored,
				typed: nothingTyped,
				chatgptLogin: "connected",
			}).chatgpt,
		).toBe(true);
	});

	it("counts a key that is stored or just typed", () => {
		expect(
			configuredProviders({
				stored: { ...nothingStored, anthropic: true },
				typed: { ...nothingTyped, openrouter: "sk-or-typed" },
				chatgptLogin: "idle",
			}),
		).toEqual({
			openrouter: true,
			chatgpt: false,
			openai: false,
			anthropic: true,
		});
	});
});
