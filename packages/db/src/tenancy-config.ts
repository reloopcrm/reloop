const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const TENANCY = {
	pool: { api: 4, app: 2, agent: 4 },
	clients: { max: 64 },
	registry: { pool: { max: 4 }, cacheMs: 5 * SECOND_MS },
	loop: { concurrency: 4, budgetMs: 30 * SECOND_MS },
	template: { placeholder: "{db}" },
	names: { maxIdLength: 40, dbPrefix: "crm_", suffixLength: 4 },
	signup: {
		pendingTtlMs: 48 * HOUR_MS,
		rate: { windowMs: MINUTE_MS, perAddress: 5, perIp: 20 },
	},
	trial: { suspendedTtlMs: 30 * DAY_MS, sweepEveryMs: DAY_MS },
	billing: { graceMs: 7 * DAY_MS },
	backup: { dumpTimeoutMs: 30 * MINUTE_MS, recentDumpMs: 36 * HOUR_MS },
} as const;
