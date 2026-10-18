export type ProviderId = "openrouter" | "chatgpt" | "openai" | "anthropic";

export type KeyedProvider = Exclude<ProviderId, "chatgpt">;

export type ConfiguredProviders = Record<ProviderId, boolean>;

export function configuredProviders(input: {
	stored: Record<KeyedProvider, boolean>;
	typed: Record<KeyedProvider, string>;
	chatgptLogin: string | undefined;
}): ConfiguredProviders {
	return {
		openrouter: input.stored.openrouter || input.typed.openrouter.length > 0,
		chatgpt: input.chatgptLogin === "connected",
		openai: input.stored.openai || input.typed.openai.length > 0,
		anthropic: input.stored.anthropic || input.typed.anthropic.length > 0,
	};
}
