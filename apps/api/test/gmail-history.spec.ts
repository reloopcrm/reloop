import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import { WORK_MAIL_QUERY } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

const MAILBOX = "rep@reloop.de";

const ok = <T>(data: T) => ({ outcome: "ok" as const, data });

function gmailMessage(id: string, labelIds: string[]): GmailMessage {
	return {
		id,
		labelIds,
		internalDate: String(Date.UTC(2026, 0, 1)),
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${id}@acme.com>` },
				{ name: "From", value: "Jane <jane@acme.com>" },
				{ name: "To", value: MAILBOX },
				{ name: "Subject", value: "Pricing" },
			],
		},
	};
}

type Entry = {
	id: number;
	added?: string[];
	removed?: { id: string; labelIds: string[] }[];
};

function harness(options: {
	entries: Entry[];
	pageSize?: number;
	labels?: Record<string, string[]>;
	dropped?: string[];
}) {
	const stored: IncomingMessage[] = [];
	const settled: { cursor?: string | null }[] = [];
	const requested: (string | undefined)[] = [];
	const size = options.pageSize ?? 1;

	const gmail = {
		async profile() {
			return ok({ emailAddress: MAILBOX, historyId: "9000" });
		},
		async listHistory(
			_token: string,
			request: { startHistoryId: string; pageToken?: string },
		) {
			requested.push(request.pageToken);
			const after = options.entries.filter(
				(entry) => entry.id > Number(request.startHistoryId),
			);
			const from = request.pageToken ? Number(request.pageToken) : 0;
			const page = after.slice(from, from + size);
			const last = after.at(-1);

			return ok({
				history: page.map((entry) => ({
					id: String(entry.id),
					messagesAdded: (entry.added ?? []).map((id) => ({
						message: { id },
					})),
					labelsRemoved: (entry.removed ?? []).map((removed) => ({
						message: { id: removed.id },
						labelIds: removed.labelIds,
					})),
				})),
				historyId: last ? String(last.id) : request.startHistoryId,
				nextPageToken:
					from + size < after.length ? String(from + size) : undefined,
			});
		},
		async listMessages() {
			return ok({ messages: [] });
		},
		async getMessage(_token: string, id: string) {
			return ok(gmailMessage(id, options.labels?.[id] ?? ["INBOUND"]));
		},
	} as unknown as GmailClient;

	const db = {
		emailMessage: {
			async findMany() {
				return [];
			},
		},
		appSetting: {
			async findUnique() {
				return { plan: null };
			},
		},
		emailThread: {
			async count() {
				return 0;
			},
		},
	} as unknown as Db;

	const tokens = {
		async accessTokenFor() {
			return { outcome: "ok" as const, accessToken: "token" };
		},
	} as unknown as MailboxTokenService;

	const state = {
		async markRunning() {},
		async settle(_id: string, update: { cursor?: string | null }) {
			settled.push(update);
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
			_options: { mailbox: string },
			parsed: IncomingMessage,
		) {
			if (options.dropped?.includes(parsed.gmailMessageId ?? "")) return false;
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new GmailSyncService(db, gmail, tokens, state, threads),
		stored,
		settled,
		requested,
	};
}

function rowAt(cursor: string) {
	return {
		id: "sync-1",
		userId: "user-1",
		source: "gmail",
		cursor,
		backfill: null,
		importSince: null,
		autoCreate: true,
		createFrom: null,
		status: "IDLE",
	} as unknown as MailboxSync;
}

const ids = (kit: { stored: IncomingMessage[] }) =>
	kit.stored.map((message) => message.gmailMessageId);

describe("Gmail incremental history", () => {
	it("reads every history page and moves the cursor to the last entry", async () => {
		const kit = harness({
			entries: [
				{ id: 1100, added: ["a1", "a2"] },
				{ id: 1200, added: ["b1"] },
			],
		});

		await kit.service.sync(rowAt("1000"));

		expect(ids(kit)).toEqual(["a1", "a2", "b1"]);
		expect(kit.requested).toEqual([undefined, "1"]);
		expect(kit.settled.at(-1)?.cursor).toBe("1200");
	});

	it("makes progress across ticks when the history is longer than the page cap", async () => {
		const entries = Array.from({ length: 22 }, (_, at) => ({
			id: 2000 + at,
			added: [`m${at}`],
		}));
		const kit = harness({ entries });

		await kit.service.sync(rowAt("1000"));

		expect(kit.requested).toHaveLength(20);
		expect(ids(kit)).toHaveLength(20);
		const first = kit.settled.at(-1)?.cursor;
		expect(first).toBe("2019");

		await kit.service.sync(rowAt(first ?? "1000"));

		expect(ids(kit)).toHaveLength(22);
		expect(kit.settled.at(-1)?.cursor).toBe("2021");
	});

	it("moves past messages that are skipped or not stored", async () => {
		const entries = Array.from({ length: 125 }, (_, at) => ({
			id: 3000 + at,
			added: [`n${at}`],
		}));
		const kit = harness({
			entries,
			pageSize: 10,
			dropped: entries.map((_, at) => `n${at}`),
		});

		await kit.service.sync(rowAt("1000"));
		const first = kit.settled.at(-1)?.cursor;
		expect(first).toBe("3119");

		await kit.service.sync(rowAt(first ?? "1000"));
		expect(kit.settled.at(-1)?.cursor).toBe("3124");
	});

	it("skips drafts, spam and trash", async () => {
		const kit = harness({
			entries: [{ id: 1100, added: ["d1", "s1", "t1", "i1"] }],
			labels: { d1: ["DRAFT"], s1: ["SPAM"], t1: ["TRASH", "INBOX"] },
		});

		await kit.service.sync(rowAt("1000"));

		expect(ids(kit)).toEqual(["i1"]);
		expect(kit.settled.at(-1)?.cursor).toBe("1100");
	});

	it("reads a message that leaves spam as new mail", async () => {
		const kit = harness({
			entries: [
				{ id: 1100, removed: [{ id: "x1", labelIds: ["SPAM"] }] },
				{ id: 1200, removed: [{ id: "x2", labelIds: ["UNREAD"] }] },
			],
			labels: { x1: ["INBOX"], x2: ["INBOX"] },
		});

		await kit.service.sync(rowAt("1000"));

		expect(ids(kit)).toEqual(["x1"]);
		expect(kit.settled.at(-1)?.cursor).toBe("1200");
	});

	it("keeps drafts, spam and trash out of the backfill query", () => {
		for (const term of ["-in:drafts", "-in:spam", "-in:trash"]) {
			expect(WORK_MAIL_QUERY).toContain(term);
		}
	});
});
