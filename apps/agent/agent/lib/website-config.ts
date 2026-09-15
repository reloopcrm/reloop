const SECOND_MS = 1_000;
const KB = 1_024;

export const WEBSITE = {
	timeoutMs: 15 * SECOND_MS,
	modelTimeoutMs: 60 * SECOND_MS,
	htmlMaxChars: 400 * KB,
	textMaxChars: 6_000,
	jsonAttempts: 2,
	userAgent: "Mozilla/5.0 (compatible; CRM brand reader)",
} as const;
