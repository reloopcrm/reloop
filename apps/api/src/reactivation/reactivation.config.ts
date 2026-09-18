const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const READING = {
	rateWindowMs: 30 * MINUTE_MS,
	assumedSecondsPerThread: 12,
} as const;

export const WIN_BACK = {
	followUp: {
		afterDays: 14,
		maxAgeDays: 28,
		maxPerDay: 10,
		everyMs: 6 * HOUR_MS,
	},
} as const;
