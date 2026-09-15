const MINUTE_MS = 60_000;

export const READING = {
	rateWindowMs: 30 * MINUTE_MS,
	assumedSecondsPerThread: 12,
} as const;
