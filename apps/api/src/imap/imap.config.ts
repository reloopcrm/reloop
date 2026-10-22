import { MAILBOX } from "../mailbox/mailbox.config";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const KB = 1_024;

export const IMAP = {
	connect: {
		connectionTimeoutMs: 20 * SECOND_MS,
		greetingTimeoutMs: 15 * SECOND_MS,
		socketTimeoutMs: 120 * SECOND_MS,
		goneCodes: ["NoConnection", "EConnectionClosed", "StateLogout"],
		networkCodes: [
			"ENOTFOUND",
			"ECONNREFUSED",
			"ETIMEDOUT",
			"EHOSTUNREACH",
			"ECONNRESET",
			"EPIPE",
			"ENETUNREACH",
			"EAI_AGAIN",
			"ETIMEOUT",
			"CONNECT_TIMEOUT",
			"GREETING_TIMEOUT",
			"UPGRADE_TIMEOUT",
			"ETHROTTLE",
		],
	},
	auth: {
		definitiveCodes: [
			"AUTHENTICATIONFAILED",
			"AUTHORIZATIONFAILED",
			"EXPIRED",
			"PRIVACYREQUIRED",
			"CONTACTADMIN",
		],
		backoffBaseMs: MINUTE_MS,
		backoffCapMs: 30 * MINUTE_MS,
		permanentAfterMs: 6 * HOUR_MS,
	},
	manual: {
		budgetMs: MINUTE_MS,
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
