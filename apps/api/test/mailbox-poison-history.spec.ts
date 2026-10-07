import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import { Logger } from "@nestjs/common";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import {
	MAILBOX as MAILBOX_CONFIG,
	type MailboxSyncConfig,
	MESSAGE_FAILURES,
	mailboxSyncConfig,
} from "../src/mailbox/mailbox.config";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

type Persisted = { cursor: string | null; backfill: string | null };

const MAILBOX = "rep@example.com";
const SENDER = "jane@acme.example.com";
const POISONED = Array.from({ length: 6 }, (_, at) => `p${at}`);
const TICKS = POISONED.length * MESSAGE_FAILURES.maxAttempts + 5;

const ok = <T>(data: T) => ({ outcome: "ok" as const, data });

const original = Object.getOwnPropertyDescriptor(MAILBOX_CONFIG, "sync");

function useTinySizes(): void {
	const base = mailboxSyncConfig({
		MAILBOX_SYNC_MAX_PER_TICK: "1",
		MAILBOX_SYNC_BACKFILL_CHUNK: "1",
		MAILBOX_SYNC_PAGE_SIZE: "1",
	});
	const tiny = { ...base, forwardMax: 1 } as unknown as MailboxSyncConfig;
	Object.defineProperty(MAILBOX_CONFIG, "sync", {
		configurable: true,
		get: () => tiny,
	});
}

afterEach(() => {
	if (original) Object.defineProperty(MAILBOX_CONFIG, "sync", original);
	spyOn(Logger.prototype, "warn").mockRestore();
});

function gmailMessage(id: string): GmailMessage {
	return {
		id,
		labelIds: ["INBOX"],
		internalDate: String(Date.UTC(2026, 0, 1)),
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${id}@acme.example.com>` },
				{ name: "From", value: `Jane <${SENDER}>` },
				{ name: "To", value: MAILBOX },
				{ name: "Subject", value: "Pricing" },
			],
		},
	};
}

function gmailKit(options: {
	history: string[];
	backfill: string[];
	poisoned: readonly string[];
}) {
	const persisted: Persisted = { cursor: "1000", backfill: null };
	const stored: string[] = [];

	const gmail = {
		async profile() {
			return ok({ emailAddress: MAILBOX, historyId: "9000" });
		},
		async listHistory(_token: string, request: { startHistoryId: string }) {
			const fresh = Number(request.startHistoryId) < 1100;
			return ok({
				history: fresh
					? [
							{
								id: "1100",
								messagesAdded: options.history.map((id) => ({
									message: { id },
								})),
							},
						]
					: [],
				historyId: "1100",
			});
		},
		async listMessages() {
			return ok({ messages: options.backfill.map((id) => ({ id })) });
		},
		async getMessage(_token: string, id: string) {
			return ok(gmailMessage(id));
		},
	} as unknown as GmailClient;

	const db = {
		emailMessage: {
			async findMany(args: { where: { gmailMessageId: { in: string[] } } }) {
				return args.where.gmailMessageId.in
					.filter((id) => stored.includes(id))
					.map((gmailMessageId) => ({ gmailMessageId }));
			},
		},
		appSetting: { findUnique: async () => ({ plan: null }) },
		emailThread: { count: async () => 0 },
	} as unknown as Db;

	const tokens = {
		accessTokenFor: async () => ({
			outcome: "ok" as const,
			accessToken: "token",
		}),
	} as unknown as MailboxTokenService;

	const state = {
		async markRunning() {},
		async recordAddress() {},
		async settle(
			_id: string,
			update: { cursor?: string | null; backfill?: string | null },
		) {
			if (update.cursor !== undefined && update.cursor !== null) {
				persisted.cursor = update.cursor;
			}
			if (update.backfill !== undefined) persisted.backfill = update.backfill;
		},
		async saveBackfill(_id: string, backfill: string | null) {
			persisted.backfill = backfill;
		},
		async clearCursor() {},
		async markNeedsReconnect() {},
		async markRateLimited() {},
		async markFailed() {},
	} as unknown as SyncStateService;

	const threads = {
		async context() {
			return {};
		},
		async store(
			_row: MailboxSync,
			_options: { origin: string },
			parsed: IncomingMessage,
		) {
			const id = parsed.gmailMessageId ?? "";
			if (options.poisoned.includes(id)) {
				throw new Error(`insert failed for ${SENDER}`);
			}
			stored.push(id);
			return true;
		},
	} as unknown as ThreadWriterService;

	const service = new GmailSyncService(db, gmail, tokens, state, threads);

	const tick = async () => {
		try {
			await service.sync({
				id: "sync-1",
				userId: "user-1",
				source: "gmail",
				cursor: persisted.cursor,
				backfill: persisted.backfill,
				importSince: null,
				autoCreate: true,
				createFrom: null,
				status: "IDLE",
			} as unknown as MailboxSync);
		} catch {
			return;
		}
	};

	return { tick, stored, persisted };
}

function warnedOnce(
	spy: { mock: { calls: unknown[][] } },
	ids: readonly string[],
): void {
	const lines = spy.mock.calls.map((call) => JSON.stringify(call[0]));
	for (const id of ids) {
		const mine = lines.filter((line) => line.includes(`"${id}"`));
		expect(mine).toHaveLength(1);
		expect(mine[0]).toContain("sync-1");
		expect(mine[0]).not.toContain("@");
	}
}

describe("more poisoned Gmail messages than one tick reads", () => {
	it("walks past one history entry that holds all of them", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		useTinySizes();
		const kit = gmailKit({
			history: [...POISONED, "good"],
			backfill: [],
			poisoned: POISONED,
		});

		for (let tick = 1; tick <= TICKS; tick += 1) await kit.tick();

		expect(kit.persisted.cursor).toBe("1100");
		expect(kit.stored).toEqual(["good"]);
		warnedOnce(warn, POISONED);
	});

	it("walks past one backfill page that holds all of them", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		useTinySizes();
		const kit = gmailKit({
			history: [],
			backfill: [...POISONED, "good"],
			poisoned: POISONED,
		});

		for (let tick = 1; tick <= TICKS; tick += 1) await kit.tick();

		expect(kit.stored).toEqual(["good"]);
		warnedOnce(warn, POISONED);
	});
});

describe("a Gmail backfill failure after a forward skip in the same tick", () => {
	it("keeps the forward count until the cursor is saved", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const poisoned = ["forward-poison", "backfill-poison"];
		const kit = gmailKit({
			history: ["forward-poison", "good"],
			backfill: ["backfill-poison"],
			poisoned,
		});

		for (let tick = 1; tick <= TICKS; tick += 1) await kit.tick();

		expect(kit.persisted.cursor).toBe("1100");
		expect(kit.stored).toEqual(["good"]);
		warnedOnce(warn, poisoned);
	});
});
