import { MAILBOX } from "../mailbox/mailbox.config";

const SECOND_MS = 1_000;
const KB = 1_024;

export const IMAP = {
	connect: {
		connectionTimeoutMs: 20 * SECOND_MS,
		greetingTimeoutMs: 15 * SECOND_MS,
		socketTimeoutMs: 120 * SECOND_MS,
	},
	sync: {
		get maxMessagesPerTick() {
			return MAILBOX.sync.maxMessagesPerTick;
		},
		forwardChunk: 100,
		get backfillChunk() {
			return MAILBOX.sync.backfillChunk;
		},
		sourceMaxBytes: 512 * KB,
	},
	folders: {
		skipSpecialUse: [
			"\\Junk",
			"\\Trash",
			"\\Drafts",
			"\\Flagged",
			"\\Important",
		],
		noSelectFlag: "\\Noselect",
		sent: "\\Sent",
		all: "\\All",
		archive: "\\Archive",
		inbox: "INBOX",
	},
	purge: { timeoutMs: 60 * SECOND_MS },
} as const;
