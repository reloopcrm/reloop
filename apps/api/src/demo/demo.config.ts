const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const DEMO_DATA = {
	lock: { key: 8_531_207 },
	write: { timeoutMs: 5 * MINUTE_MS, maxWaitMs: 10 * SECOND_MS },
	calendarSource: "calendar",
} as const;
