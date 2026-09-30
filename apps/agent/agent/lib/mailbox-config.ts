const DAY_MS = 24 * 60 * 60 * 1_000;

export const MAILBOX_PROFILE = {
	rebuild: {
		afterMs: 90 * DAY_MS,
		minGapMs: 7 * DAY_MS,
		growthFactor: 2,
	},
	stats: {
		recentThreads: 2_000,
		commonShare: 0.2,
		commonMinSenders: 2,
	},
	sample: {
		sent: 36,
		received: { freemail: 8, role: 8, work: 8 },
		receivedPool: 120,
		excerptChars: 400,
		subjectChars: 120,
	},
	model: {
		maxOutputTokens: 2_500,
	},
	followUp: {
		max: 4,
		minQuoteChars: 12,
	},
	ownAddresses: {
		max: 200,
	},
	roleLocalParts: [
		"info",
		"sales",
		"contact",
		"kontakt",
		"support",
		"team",
		"hello",
		"hallo",
		"billing",
		"accounts",
		"help",
		"booking",
		"bookings",
		"meetings",
		"office",
		"buero",
		"service",
		"verkauf",
		"einkauf",
		"bestellung",
		"order",
		"orders",
		"anfrage",
		"mail",
		"post",
	],
} as const;
