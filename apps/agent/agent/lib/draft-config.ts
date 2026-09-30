const DAY_MS = 24 * 60 * 60 * 1_000;

export const DRAFT = {
	threads: 3,
	messagesPerThread: 8,
	earlierThreadMessages: 2,
	bodyMaxChars: 1_200,
	conversationMaxChars: 6_000,
	subjectMaxChars: 140,
	textMaxChars: 2_000,
	maxOutputTokens: 1_500,
	learnAttempts: 3,
	recentDrafts: 8,
	openingMaxChars: 120,
	dayMs: DAY_MS,
	staleAfterDays: 14,
	voice: {
		pool: 40,
		examples: 3,
		minChars: 20,
		exampleMaxChars: 400,
		totalMaxChars: 1_600,
		avoidLines: 6,
		listItems: 3,
		listItemMaxChars: 80,
		signOffLines: 2,
		signOffLineMaxChars: 40,
	},
} as const;
