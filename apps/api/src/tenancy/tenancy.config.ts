const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const SIGNUP = {
	hint: {
		google: ["gmail.com", "googlemail.com"],
		microsoft: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
	},
	code: {
		digits: 6,
		ttlMs: 15 * MINUTE_MS,
		maxAttempts: 5,
		resendAfterMs: 60 * SECOND_MS,
	},
} as const;

export const DELETION = {
	rate: { windowMs: MINUTE_MS, perUser: 5 },
} as const;

export const IMPORT = {
	dryRunSuffix: "_dryrun_test",
	oldSecretVar: "IMPORT_OLD_SECRET",
	oldGermanVar: "IMPORT_RELOOP_GERMAN",
	restore: { timeoutMs: 60 * MINUTE_MS },
	contextDev: { purpose: "context-dev-key" },
} as const;
