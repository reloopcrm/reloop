const SECOND_MS = 1_000;

export const TEST_TIMEOUT = {
	nestColdStartMs: 30 * SECOND_MS,
	demoSeedMs: 30 * SECOND_MS,
	demoSeedTransactionMs: 25 * SECOND_MS,
	demoLockHoldMs: 10 * SECOND_MS,
} as const;
