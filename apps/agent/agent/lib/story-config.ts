import { PERSON_STORY } from "@crm/validation/person-story";

export const STORY = {
	threads: 12,
	messages: PERSON_STORY.messagesRead,
	bodyMaxChars: 1_200,
	transcriptMaxChars: 30_000,
	deals: 12,
	maxOutputTokens: 4_000,
	providerOptions: { openai: { reasoningEffort: "low" } },
} as const;
