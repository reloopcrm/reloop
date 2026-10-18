export type AiStep = "hidden" | "keys-only" | "all";

export type AiChoice = "openai" | "anthropic" | "openrouter" | "chatgpt";

export const AI_STEP = {
	choices: {
		all: ["openai", "anthropic", "chatgpt"],
		"keys-only": ["openai", "anthropic", "openrouter"],
	},
	labels: {
		openai: "OpenAI API key",
		anthropic: "Anthropic API key",
		openrouter: "OpenRouter API key",
		chatgpt: "ChatGPT subscription",
	},
	placeholders: {
		openai: "sk-… from platform.openai.com",
		anthropic: "sk-ant-… from console.anthropic.com",
		openrouter: "sk-or-… from openrouter.ai/keys",
	},
} as const satisfies {
	choices: Record<Exclude<AiStep, "hidden">, readonly AiChoice[]>;
	labels: Record<AiChoice, string>;
	placeholders: Record<Exclude<AiChoice, "chatgpt">, string>;
};

export function aiStepFor(input: {
	hosted: boolean;
	fixed: boolean;
	buyingOwnKey?: boolean;
}): AiStep {
	if (input.fixed && !input.buyingOwnKey) return "hidden";
	return input.hosted ? "keys-only" : "all";
}
