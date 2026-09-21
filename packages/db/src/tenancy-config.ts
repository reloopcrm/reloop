const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_S = 24 * 60 * 60;

export const TENANCY = {
	pool: { api: 4, app: 2, agent: 4 },
	clients: { max: 64 },
	registry: { pool: { max: 4 }, cacheMs: 30 * SECOND_MS },
	cookie: { maxAgeSeconds: 365 * DAY_S },
	apiKey: { prefix: "crm_" },
	template: { placeholder: "{db}" },
	loop: { tenantTimeoutMs: 5 * MINUTE_MS },
} as const;
