const SECOND_MS = 1_000;

export const TENANCY = {
	pool: { api: 4, app: 2, agent: 4 },
	clients: { max: 64 },
	registry: { pool: { max: 4 }, cacheMs: 5 * SECOND_MS },
	loop: { concurrency: 4, budgetMs: 30 * SECOND_MS },
	template: { placeholder: "{db}" },
} as const;
