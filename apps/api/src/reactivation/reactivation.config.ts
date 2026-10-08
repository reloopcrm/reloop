const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const READING = {
	rateWindowMs: 30 * MINUTE_MS,
	assumedSecondsPerThread: 12,
	loginCheck: { timeoutMs: 2_000, cacheMs: MINUTE_MS },
} as const;

export const PERSON_VIEW = {
	mails: 100,
	bodyMaxChars: 8_000,
	timelineMails: 400,
	retryAfterMs: 6 * HOUR_MS,
	rereadPauseMs: 15 * MINUTE_MS,
	prefetch: {
		top: 20,
		everyMs: 5 * MINUTE_MS,
		openShare: 0.1,
		sort: "potential",
		dir: "desc",
	},
} as const;

export const WIN_BACK = {
	followUp: {
		afterDays: 14,
		maxAgeDays: 28,
		maxPerDay: 10,
		everyMs: 6 * HOUR_MS,
	},
} as const;
