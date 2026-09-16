const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const SYSTEM = {
	version: { fallback: "0.0.0" },
	updateCheck: {
		url: "https://api.github.com/repos/reloopcrm/reloop/releases/latest",
		userAgent: "reloop-update-check",
		timeoutMs: 5 * SECOND_MS,
		cacheMs: 6 * HOUR_MS,
		retryMs: 10 * MINUTE_MS,
		forceMs: 30 * SECOND_MS,
	},
} as const;
