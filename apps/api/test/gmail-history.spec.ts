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

function harness(options: {
	pages: { ids: string[]; historyId: string }[];
	labels?: Record<string, string[]>;
}) {
	const stored: IncomingMessage[] = [];
	const settled: { cursor?: string | null }[] = [];
	const requested: (string | undefined)[] = [];

	const gmail = {
		async profile() {
			return ok({ emailAddress: MAILBOX, historyId: "9000" });
		},
		async listHistory(
			_token: string,
			request: { startHistoryId: string; pageToken?: string },
		) {
			requested.push(request.pageToken);
			const at = request.pageToken ? Number(request.pageToken) : 0;
			const page = options.pages[at];

			return ok({
				history: (page?.ids ?? []).map((id) => ({
					messagesAdded: [{ message: { id } }],
				})),
				historyId: page?.historyId,
				nextPageToken:
					at + 1 < options.pages.length ? String(at + 1) : undefined,
			});
		},
		async listMessages() {
			return ok({ messages: [] });
		},
		async getMessage(_token: string, id: string) {
			return ok(gmailMessage(id, options.labels?.[id] ?? ["INBOX"]));
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

const row = {
	id: "sync-1",
	userId: "user-1",
	source: "gmail",
	cursor: "1000",
	backfill: null,
	importSince: null,
	autoCreate: true,
	createFrom: null,
	status: "IDLE",
} as unknown as MailboxSync;

describe("Gmail incremental history", () => {
	it("reads every history page and moves the cursor to the last page", async () => {
		const kit = harness({
			pages: [
				{ ids: ["a1", "a2"], historyId: "1100" },
				{ ids: ["b1"], historyId: "1200" },
			],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((message) => message.gmailMessageId)).toEqual([
			"a1",
			"a2",
			"b1",
		]);
		expect(kit.requested).toEqual([undefined, "1"]);
		expect(kit.settled.at(-1)?.cursor).toBe("1200");
	});

	it("keeps the cursor when the history has more pages than the cap", async () => {
		const pages = Array.from({ length: 22 }, (_, at) => ({
			ids: [`m${at}`],
			historyId: String(2000 + at),
		}));
		const kit = harness({ pages });

		await kit.service.sync(row);

		expect(kit.requested).toHaveLength(20);
		expect(kit.stored).toHaveLength(20);
		expect(kit.settled.at(-1)?.cursor).toBe("1000");
	});

	it("skips drafts, spam and trash", async () => {
		const kit = harness({
			pages: [{ ids: ["d1", "s1", "t1", "i1"], historyId: "1100" }],
			labels: { d1: ["DRAFT"], s1: ["SPAM"], t1: ["TRASH", "INBOX"] },
		});

		await kit.service.sync(row);

		expect(kit.stored.map((message) => message.gmailMessageId)).toEqual(["i1"]);
		expect(kit.settled.at(-1)?.cursor).toBe("1100");
	});

	it("keeps drafts, spam and trash out of the backfill query", () => {
		for (const term of ["-in:drafts", "-in:spam", "-in:trash"]) {
			expect(WORK_MAIL_QUERY).toContain(term);
		}
	});
});
