import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import type {
	GmailClient,
	GmailMessage,
	MessageList,
} from "../src/google/gmail.client";
import { SENT_MAIL_QUERY } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import { readBackfill } from "../src/mailbox/backfill-cursor";
import type { SyncOrigin } from "../src/mailbox/mailbox.constants";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

type Ok<T> = { outcome: "ok"; data: T };
type NotOk =
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "failed"; reason: string; retryable: boolean };

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

const MAILBOX = "rep@reloop.de";

type StoreOptions = { mailbox: string; origin: SyncOrigin };

function gmailMessage(id: string, sentAt: Date): GmailMessage {
	return {
		id,
		internalDate: String(sentAt.getTime()),
		payload: {
			headers: [
				{ name: "Message-ID", value: `<${id}@acme.com>` },
				{ name: "From", value: `Jane <jane@acme.com>` },
				{ name: "To", value: MAILBOX },
				{ name: "Subject", value: "Pricing" },
			],
		},
	};
}

function ids(count: number, offset: number): string[] {
	return Array.from({ length: count }, (_, at) => `old-${offset + at}`);
}

function row(overrides: Partial<MailboxSync> = {}): MailboxSync {
	return {
		id: "sync-1",
		userId: "user-1",
		source: "gmail",
		cursor: "1000",
		backfill: null,
		importSince: null,
		autoCreate: true,
		createFrom: null,
		status: "IDLE",
		...overrides,
	} as unknown as MailboxSync;
}

function harness(options: {
	pages?: string[][];
	sentPages?: string[][];
	historyIds?: string[];
	plan?: string | null;
	alreadyFiled?: string[];
	getMessage?: (id: string) => NotOk | null;
}) {
	const pages = options.pages ?? [[]];
	const sentPages = options.sentPages ?? [[]];
	const filed = new Set(options.alreadyFiled ?? []);

	const stored: IncomingMessage[] = [];
	const listed: {
		pageToken?: string;
		after?: Date;
		before: Date;
		query?: string;
	}[] = [];
	const fetched: string[] = [];
	const settled: { cursor?: string | null; backfill?: string | null }[] = [];
	const rateLimited: number[] = [];

	const gmail = {
		async profile() {
			return ok({ emailAddress: MAILBOX, historyId: "1001" });
		},
		async listHistory() {
			return ok({
				history: (options.historyIds ?? []).map((id) => ({
					messagesAdded: [{ message: { id } }],
				})),
				historyId: "1001",
			});
		},
		async listMessages(
			_token: string,
			request: {
				pageToken?: string;
				after?: Date;
				before: Date;
				query?: string;
			},
		) {
			listed.push(request);

			const sent = request.query === SENT_MAIL_QUERY;
			const all = sent ? sentPages : pages;
			const prefix = sent ? "s" : "p";

			const at = request.pageToken ? Number(request.pageToken.slice(1)) : 0;
			const body: MessageList = {
				messages: (all[at] ?? []).map((id) => ({ id })),
			};
			if (at + 1 < all.length) body.nextPageToken = `${prefix}${at + 1}`;

			return ok(body);
		},
		async getMessage(_token: string, id: string) {
			const failure = options.getMessage?.(id);
			if (failure) return failure;

			fetched.push(id);
			return ok(gmailMessage(id, new Date(Date.UTC(2024, 0, 1))));
		},
	} as unknown as GmailClient;

	const db = {
		emailMessage: {
			async findMany({
				where,
			}: {
				where: { gmailMessageId: { in: string[] } };
			}) {
				return where.gmailMessageId.in
					.filter((id) => filed.has(id))
					.map((id) => ({ gmailMessageId: id }));
			},
		},
		appSetting: {
			async findUnique() {
				return { plan: options.plan ?? null };
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
		async settle(
			_id: string,
			update: { cursor?: string | null; backfill?: string | null },
		) {
			settled.push(update);
		},
		async clearCursor() {},
		async markNeedsReconnect() {},
		async markRateLimited(_id: string, retryAfterMs: number) {
			rateLimited.push(retryAfterMs);
		},
		async markFailed() {},
	} as unknown as SyncStateService;

	const threads = {
		async context() {
			return {};
		},
		async store(
			_row: MailboxSync,
			_options: StoreOptions,
			parsed: IncomingMessage,
		) {
			if (parsed.gmailMessageId) filed.add(parsed.gmailMessageId);
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new GmailSyncService(db, gmail, tokens, state, threads),
		stored,
		listed,
		fetched,
		settled,
		rateLimited,
	};
}

const backfillOf = (raw: string | null | undefined) => {
	const read = readBackfill(raw);
	if (read.outcome !== "ok") throw new Error(`no backfill: ${read.outcome}`);

	return read.backfill;
};

describe("GmailSyncService backfill", () => {
	it("reads mail older than the cursor and files it", async () => {
		const kit = harness({ pages: [["old-1", "old-2"]] });

		await kit.service.sync(row());

		expect(kit.stored.map((message) => message.gmailMessageId)).toEqual([
			"old-1",
			"old-2",
		]);
		expect(backfillOf(kit.settled.at(-1)?.backfill).state).toBe("done");
	});

	it("asks only for mail older than the moment the backfill started", async () => {
		const kit = harness({ pages: [["old-1"]] });

		await kit.service.sync(row());

		const request = kit.listed.at(0);
		expect(request?.before.getTime()).toBeLessThanOrEqual(Date.now());
		expect(request?.after).toBeUndefined();
	});

	it("reads the sent folder before the rest of the mailbox", async () => {
		const kit = harness({
			sentPages: [["sent-1", "sent-2"]],
			pages: [["old-1"]],
		});

		await kit.service.sync(row());

		expect(kit.stored.map((message) => message.gmailMessageId)).toEqual([
			"sent-1",
			"sent-2",
			"old-1",
		]);
		expect(kit.listed.at(0)?.query).toBe(SENT_MAIL_QUERY);
		expect(kit.listed.at(-1)?.query).not.toBe(SENT_MAIL_QUERY);
	});

	it("keeps the plan floor when the workspace plan limits the history", async () => {
		const kit = harness({ pages: [["old-1"]], plan: "test" });

		await kit.service.sync(row());

		const floor = backfillOf(kit.settled.at(-1)?.backfill).floor;
		expect(floor).not.toBeNull();
	});

	it("stops on the tick budget and keeps the page it stopped on", async () => {
		const kit = harness({
			pages: [ids(100, 0), ids(100, 100), ids(100, 200), ids(100, 300)],
		});

		await kit.service.sync(row());

		expect(kit.stored).toHaveLength(250);

		const plan = backfillOf(kit.settled.at(-1)?.backfill);
		expect(plan.state).toBe("running");
		expect(plan.position).toBe("p2");
	});

	it("resumes from the stored page on the next tick", async () => {
		const first = harness({
			pages: [ids(100, 0), ids(100, 100), ids(100, 200), ids(100, 300)],
		});

		await first.service.sync(row());
		const carried = first.settled.at(-1)?.backfill ?? null;

		const second = harness({
			pages: [ids(100, 0), ids(100, 100), ids(100, 200), ids(100, 300)],
		});

		await second.service.sync(row({ backfill: carried }));

		expect(second.listed.at(0)?.pageToken).toBe("p2");
		expect(second.stored.at(0)?.gmailMessageId).toBe("old-200");
		expect(backfillOf(second.settled.at(-1)?.backfill).state).toBe("done");
	});

	it("does not fetch a message it has already filed", async () => {
		const kit = harness({
			pages: [["old-1", "old-2"]],
			alreadyFiled: ["old-1"],
		});

		await kit.service.sync(row());

		expect(kit.fetched).toEqual(["old-2"]);
	});

	it("never starts again once the backfill is done", async () => {
		const kit = harness({ pages: [["old-1"]] });

		await kit.service.sync(row());
		const done = kit.settled.at(-1)?.backfill ?? null;

		const again = harness({ pages: [["old-1"]] });
		await again.service.sync(row({ backfill: done }));

		expect(again.listed).toHaveLength(0);
		expect(again.stored).toHaveLength(0);
	});

	it("pauses the backfill on a quota error and keeps the position", async () => {
		const kit = harness({
			pages: [ids(100, 0), ids(100, 100)],
			getMessage: (id) =>
				id === "old-150"
					? {
							outcome: "rate-limited",
							reason: "Quota exceeded",
							retryAfterMs: 30_000,
						}
					: null,
		});

		const outcome = await kit.service.sync(row());

		expect(outcome.status).toBe("rate-limited");
		expect(kit.rateLimited).toEqual([30_000]);

		const plan = backfillOf(kit.settled.at(-1)?.backfill);
		expect(plan.state).toBe("running");
		expect(plan.position).toBe("p1");
	});

	it("gives the forward read the whole budget before the backfill", async () => {
		const kit = harness({
			historyIds: ids(120, 900),
			pages: [ids(100, 0), ids(100, 100), ids(100, 200)],
		});

		await kit.service.sync(row());

		expect(
			kit.stored.slice(0, 120).map((message) => message.gmailMessageId),
		).toEqual(ids(120, 900));
		expect(kit.stored).toHaveLength(250);
	});
});
