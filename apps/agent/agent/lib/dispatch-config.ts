const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DISPATCH = {
	visible: {
		batch: 60,
		concurrency: 6,
		leaseMs: 6 * MINUTE_MS,
	},

	insight: {
		batch: 90,
		concurrency: 6,
		leaseMs: 6 * MINUTE_MS,
		gate: {
			batch: 300,
			concurrency: 15,
		},
	},

	research: {
		batch: 12,
		leaseMs: 30 * MINUTE_MS,
		link: { attempts: 3, retryMs: 250 },
	},

	builder: {
		batch: 20,
		maxAttempts: 3,
		leaseMs: 5 * MINUTE_MS,
		feedback: { items: 6, quoteChars: 300 },
	},

	dealStall: {
		everyMs: 7 * DAY_MS,
		dayMs: DAY_MS,
		quietDays: 30,
		batch: 20,
		threads: 3,
		messagesPerThread: 4,
		subjectMaxChars: 120,
		bodyMaxChars: 900,
	},

	run: {
		batch: 20,
		maxPasses: 5,
		deliveryLeaseMs: 5 * MINUTE_MS,
		actionLeaseMs: 5 * MINUTE_MS,
		executionTimeoutMs: 20 * MINUTE_MS,
		noActionTriggerTypes: ["EVENT", "SCHEDULE", "WEBHOOK"],
	},

	task: {
		leaseMs: 10 * MINUTE_MS,
	},

	blocked: {
		retryMs: 30 * MINUTE_MS,
	},

	reconcile: {
		scan: 200,
		retire: 100,
	},

	standing: {
		page: 400,
	},

	sweep: {
		timeoutMs: 4 * MINUTE_MS,
		staleQueueMs: 5 * MINUTE_MS,
		startTimeoutMs: MINUTE_MS,
		itemTimeoutMs: 2 * MINUTE_MS,
		maxAbandoned: 1,
		abandonGraceMs: 15 * MINUTE_MS,
	},
} as const;
