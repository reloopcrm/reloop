export const STORY = {
	threads: 12,
	messages: 60,
	bodyMaxChars: 1_200,
	transcriptMaxChars: 30_000,
	deals: 12,
	maxOutputTokens: 4_000,
	providerOptions: { openai: { reasoningEffort: "low" } },
} as const;
