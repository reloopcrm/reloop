const SECOND_MS = 1_000;

export const ADOPTION = {
	batch: 50,
} as const;

export const MAILBOX = {
	sync: {
		maxMessagesPerTick: 250,
		forwardMax: 120,
		forwardOverlapMs: SECOND_MS,
		backfillChunk: 100,
		pageSize: 50,
	},
} as const;
