import { z } from "zod";

const SECOND_MS = 1_000;

export const ADOPTION = {
	batch: 50,
} as const;

export const SYNC_TICK = {
	selfHostBudgetMs: 60 * SECOND_MS,
	settleReserveMs: 2 * SECOND_MS,
} as const;

export const NO_DEADLINE = Number.POSITIVE_INFINITY;

export function pastDeadline(deadlineAt: number): boolean {
	return Date.now() >= deadlineAt;
}

const GMAIL_QUOTA = {
	unitsPerUserPerMinute: 6_000,
	messageGetUnits: 20,
	reserve: 0.8,
} as const;

const positiveInt = (fallback: number) =>
	z.coerce.number().int().min(1).default(fallback);

const mailboxSyncEnv = z.object({
	MAILBOX_SYNC_MAX_PER_TICK: positiveInt(1_000),
	MAILBOX_SYNC_BACKFILL_CHUNK: positiveInt(500),
	MAILBOX_SYNC_PAGE_SIZE: positiveInt(200),
});

export type MailboxSyncEnv = Record<string, string | undefined>;

export function mailboxSyncConfig(env: MailboxSyncEnv) {
	const parsed = mailboxSyncEnv.parse(env);
	const gmailPerMinute = Math.floor(
		(GMAIL_QUOTA.unitsPerUserPerMinute * GMAIL_QUOTA.reserve) /
			GMAIL_QUOTA.messageGetUnits,
	);

	return {
		maxMessagesPerTick: parsed.MAILBOX_SYNC_MAX_PER_TICK,
		backfillChunk: parsed.MAILBOX_SYNC_BACKFILL_CHUNK,
		pageSize: parsed.MAILBOX_SYNC_PAGE_SIZE,
		forwardMax: 120,
		forwardOverlapMs: SECOND_MS,
		gmail: {
			maxMessagesPerTick: Math.min(
				parsed.MAILBOX_SYNC_MAX_PER_TICK,
				gmailPerMinute,
			),
		},
	} as const;
}

export type MailboxSyncConfig = ReturnType<typeof mailboxSyncConfig>;

let cached: MailboxSyncConfig | undefined;

export const MAILBOX = {
	get sync(): MailboxSyncConfig {
		cached ??= mailboxSyncConfig(process.env);
		return cached;
	},
};
