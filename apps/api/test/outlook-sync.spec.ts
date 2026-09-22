import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import { readBackfill } from "../src/mailbox/backfill-cursor";
import type { SyncSource } from "../src/mailbox/mailbox.constants";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import type { GraphClient, GraphMessage } from "../src/microsoft/graph.client";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

type Ok<T> = { outcome: "ok"; data: T };
type NotOk =
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "failed"; reason: string; retryable: boolean };

const ok = <T>(data: T): Ok<T> => ({ outcome: "ok", data });

type StoreOptions = { mailbox: string; origin: SyncSource };

type GraphPage = {
	value: GraphMessage[];
	"@odata.nextLink"?: string;
};

const row = {
	id: "sync-1",
	userId: "user-1",
	source: "outlook",
	cursor: "2025-08-01T00:00:00.000Z",
	autoCreate: true,
} as unknown as MailboxSync;

type Harness = {
	service: OutlookSyncService;
	stored: IncomingMessage[];
	listed: { order?: string; folder?: string }[];
	backfillLinks: (string | null)[];
	settled: { cursor?: string | null; backfill?: string | null }[];
	rateLimited: number[];
	reconnected: string[];
	failed: string[];
	meResolvedAt: { value: number };
};

function harness(options: {
	folder?: (name: string) => Ok<{ id?: string }> | NotOk;
	pages?: GraphMessage[][];
	backfillPages?: GraphMessage[][];
	sentPages?: GraphMessage[][];
	backfillPage?: (link: string | null) => Ok<GraphPage> | NotOk;
	plan?: string | null;
	threads?: number;
	meDelayMs?: number;
}): Harness {
	const stored: IncomingMessage[] = [];
	const settled: { cursor?: string | null; backfill?: string | null }[] = [];
	const rateLimited: number[] = [];
	const reconnected: string[] = [];
	const failed: string[] = [];
	const meResolvedAt = { value: 0 };

	const pages = options.pages ?? [[]];
	const backfillPages = options.backfillPages ?? [[]];
	const sentPages = options.sentPages ?? [[]];
	const listed: { order?: string; folder?: string }[] = [];
	const backfillLinks: (string | null)[] = [];

	const pageOf = (
		all: GraphMessage[][],
		at: number,
		prefix: string,
	): GraphPage => {
		const body: GraphPage = { value: all[at] ?? [] };
		if (at + 1 < all.length) body["@odata.nextLink"] = `${prefix}-${at + 1}`;

		return body;
	};

	const graph = {
		async me() {
			if (options.meDelayMs) {
				await new Promise((resolve) => setTimeout(resolve, options.meDelayMs));
			}
			meResolvedAt.value = Date.now();
			return ok({ mail: "rep@reloop.de" });
		},
		async folder(_token: string, name: string) {
			return options.folder
				? options.folder(name)
				: ok({ id: `folder-${name}` });
		},
		async listMessages(
			_token: string,
			request: { order?: string; folder?: string },
		) {
			listed.push(request);
			if (request.order !== "desc") return ok(pageOf(pages, 0, "next"));

			backfillLinks.push(null);
			if (options.backfillPage) return options.backfillPage(null);

			return request.folder
				? ok(pageOf(sentPages, 0, "sent"))
				: ok(pageOf(backfillPages, 0, "back"));
		},
		async nextPage(_token: string, link: string) {
			if (link.startsWith("next-")) {
				return ok(pageOf(pages, Number(link.slice("next-".length)), "next"));
			}

			backfillLinks.push(link);
			if (options.backfillPage) return options.backfillPage(link);

			return link.startsWith("sent-")
				? ok(pageOf(sentPages, Number(link.slice("sent-".length)), "sent"))
				: ok(pageOf(backfillPages, Number(link.slice("back-".length)), "back"));
		},
	} as unknown as GraphClient;

	const db = {
		appSetting: {
			async findUnique() {
				return { plan: options.plan ?? null };
			},
		},
		emailThread: {
			async count() {
				return (options.threads ?? 0) + stored.length;
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
		async markNeedsReconnect(_id: string, reason: string) {
			reconnected.push(reason);
		},
		async markRateLimited(_id: string, retryAfterMs: number) {
			rateLimited.push(retryAfterMs);
		},
		async markFailed(_id: string, reason: string) {
			failed.push(reason);
		},
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
			stored.push(parsed);
			return true;
		},
	} as unknown as ThreadWriterService;

	return {
		service: new OutlookSyncService(db, graph, tokens, state, threads),
		listed,
		backfillLinks,
		stored,
		settled,
		rateLimited,
		reconnected,
		failed,
		meResolvedAt,
	};
}

const rowWith = (cursor: string | null): MailboxSync =>
	({ ...row, cursor }) as MailboxSync;

function message(overrides: Partial<GraphMessage> = {}): GraphMessage {
	return {
		id: "graph-1",
		internetMessageId: "<msg-1@acme.com>",
		conversationId: "conv-1",
		subject: "Pricing",
		from: { emailAddress: { name: "Jane", address: "jane@acme.com" } },
		toRecipients: [{ emailAddress: { address: "rep@reloop.de" } }],
		receivedDateTime: "2025-08-01T09:00:00.000Z",
		sentDateTime: "2025-08-01T09:00:00.000Z",
		body: { contentType: "text", content: "Hello" },
		parentFolderId: "folder-inbox",
		...overrides,
	};
}

describe("OutlookSyncService threading", () => {
	it("keeps a conversation together when Graph returns unrelated headers", async () => {
		const kit = harness({
			pages: [
				[
					message({
						id: "a",
						internetMessageId: "<first@acme.com>",
						internetMessageHeaders: [
							{ name: "x-ms-exchange-organization-authas", value: "Internal" },
							{ name: "Return-Path", value: "<jane@acme.com>" },
						],
					}),
					message({
						id: "b",
						internetMessageId: "<second@acme.com>",
						receivedDateTime: "2025-08-01T09:05:00.000Z",
						sentDateTime: "2025-08-01T09:05:00.000Z",
						internetMessageHeaders: [
							{ name: "Content-Type", value: "text/plain" },
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((parsed) => parsed.rootId)).toEqual([
			"outlook-conversation:conv-1",
			"outlook-conversation:conv-1",
		]);
	});

	it("prefers a real threading header over the conversation id", async () => {
		const kit = harness({
			pages: [
				[
					message({
						internetMessageHeaders: [
							{ name: "Return-Path", value: "<jane@acme.com>" },
							{
								name: "References",
								value: "<root@acme.com> <second@acme.com>",
							},
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("root@acme.com");
	});

	it("takes the first id when In-Reply-To carries a list", async () => {
		const kit = harness({
			pages: [
				[
					message({
						internetMessageHeaders: [
							{
								name: "In-Reply-To",
								value: "<root@acme.com> <second@acme.com>",
							},
						],
					}),
				],
			],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("root@acme.com");
	});

	it("falls back to its own id only when there is no conversation", async () => {
		const kit = harness({
			pages: [[message({ conversationId: undefined })]],
		});

		await kit.service.sync(row);

		expect(kit.stored[0]?.rootId).toBe("msg-1@acme.com");
	});
});

describe("OutlookSyncService excluded folders", () => {
	it("defers the tick when a folder lookup is throttled", async () => {
		const kit = harness({
			folder: () => ({
				outcome: "rate-limited",
				reason: "Too many requests",
				retryAfterMs: 30_000,
			}),
			pages: [[message()]],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("rate-limited");
		expect(kit.rateLimited).toEqual([30_000]);
		expect(kit.stored).toHaveLength(0);
		expect(kit.settled).toHaveLength(0);
	});

	it("asks for a reconnect when a folder lookup is unauthorized", async () => {
		const kit = harness({
			folder: () => ({ outcome: "unauthorized", reason: "Invalid token" }),
			pages: [[message()]],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("reconnect");
		expect(kit.reconnected).toEqual(["Invalid token"]);
		expect(kit.stored).toHaveLength(0);
	});

	it("treats a 404 as a mailbox without that folder and carries on", async () => {
		const kit = harness({
			folder: (name) =>
				name === "junkemail"
					? { outcome: "cursor-invalid", reason: "Not found" }
					: ok({ id: "folder-deleteditems" }),
			pages: [
				[
					message({ parentFolderId: "folder-inbox" }),
					message({
						id: "deleted",
						internetMessageId: "<deleted@acme.com>",
						parentFolderId: "folder-deleteditems",
					}),
				],
			],
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(kit.stored).toHaveLength(1);
	});
});

describe("OutlookSyncService budget", () => {
	const bulk = (count: number, offset: number): GraphMessage[] =>
		Array.from({ length: count }, (_, i) => {
			const n = offset + i;
			return message({
				id: `m-${n}`,
				internetMessageId: `<m-${n}@acme.com>`,
				conversationId: `conv-${n}`,
				receivedDateTime: new Date(
					Date.UTC(2025, 7, 1, 9, 0, 0) + n * 60_000,
				).toISOString(),
				sentDateTime: new Date(
					Date.UTC(2025, 7, 1, 9, 0, 0) + n * 60_000,
				).toISOString(),
			});
		});

	it("never processes more than the declared budget", async () => {
		const kit = harness({
			pages: [bulk(50, 0), bulk(50, 50), bulk(50, 100)],
		});

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(120);
	});

	it("leaves the cursor on the last message it actually processed", async () => {
		const kit = harness({
			pages: [bulk(50, 0), bulk(50, 50), bulk(50, 100)],
		});

		await kit.service.sync(row);

		const lastProcessed = new Date(
			Date.UTC(2025, 7, 1, 9, 0, 0) + 119 * 60_000,
		).toISOString();

		expect(kit.stored[119]?.rfcMessageId).toBe("m-119@acme.com");
		expect(kit.settled.at(-1)?.cursor).toBe(lastProcessed);
	});

	it("cuts a backfill page to the threads the plan still allows", async () => {
		const kit = harness({
			backfillPages: [bulk(200, 0), bulk(200, 200)],
			plan: "test",
			threads: 470,
		});

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(30);
		expect(kit.backfillLinks).toEqual([null, null]);

		const plan = readBackfill(kit.settled.at(-1)?.backfill);
		expect(plan.outcome === "ok" && plan.backfill.state).toBe("running");
	});

	it("stops cleanly when its deadline has passed and keeps both positions", async () => {
		const kit = harness({
			pages: [bulk(50, 0)],
			backfillPages: [bulk(50, 500)],
		});

		const outcome = await kit.service.sync(row, Date.now() - 1);

		expect(outcome.status).toBe("synced");
		expect(kit.stored).toHaveLength(0);
		expect(kit.backfillLinks).toHaveLength(0);
		expect(kit.settled.at(-1)?.cursor).toBe(row.cursor);
	});
});

describe("OutlookSyncService first run", () => {
	it("watermarks setup before the first round trip, not after", async () => {
		const kit = harness({ meDelayMs: 30 });

		await kit.service.sync(rowWith(null));

		const cursor = kit.settled.at(-1)?.cursor;
		expect(cursor).toBeTruthy();
		expect(new Date(String(cursor)).getTime()).toBeLessThan(
			kit.meResolvedAt.value - 20,
		);
	});
});

describe("OutlookSyncService backfill", () => {
	const older = (count: number, offset: number): GraphMessage[] =>
		Array.from({ length: count }, (_, at) => {
			const n = offset + at;
			const when = new Date(
				Date.UTC(2024, 0, 1, 9, 0, 0) - n * 60_000,
			).toISOString();

			return message({
				id: `old-${n}`,
				internetMessageId: `<old-${n}@acme.com>`,
				conversationId: `old-conv-${n}`,
				receivedDateTime: when,
				sentDateTime: when,
			});
		});

	const planOf = (raw: string | null | undefined) => {
		const read = readBackfill(raw);
		if (read.outcome !== "ok") throw new Error(`no backfill: ${read.outcome}`);

		return read.backfill;
	};

	it("reads mail older than the cursor and files it", async () => {
		const kit = harness({ backfillPages: [older(2, 0)] });

		await kit.service.sync(row);

		expect(kit.stored.map((parsed) => parsed.rfcMessageId)).toEqual([
			"old-0@acme.com",
			"old-1@acme.com",
		]);
		expect(kit.listed.at(-1)?.order).toBe("desc");
		expect(planOf(kit.settled.at(-1)?.backfill).state).toBe("done");
	});

	it("reads the sent folder before the rest of the mailbox", async () => {
		const kit = harness({
			sentPages: [older(2, 500)],
			backfillPages: [older(1, 0)],
		});

		await kit.service.sync(row);

		expect(kit.stored.map((parsed) => parsed.rfcMessageId)).toEqual([
			"old-500@acme.com",
			"old-501@acme.com",
			"old-0@acme.com",
		]);
		expect(kit.listed.at(1)?.folder).toBe("sentitems");
		expect(kit.listed.at(-1)?.folder).toBeUndefined();
	});

	it("stops on the tick budget and keeps the page it stopped on", async () => {
		const kit = harness({
			backfillPages: [older(400, 0), older(400, 400), older(400, 800)],
		});

		await kit.service.sync(row);

		expect(kit.stored).toHaveLength(1000);

		const plan = planOf(kit.settled.at(-1)?.backfill);
		expect(plan.state).toBe("running");
		expect(plan.position).toBe("back-2");
	});

	it("resumes from the stored page on the next tick", async () => {
		const first = harness({
			backfillPages: [older(400, 0), older(400, 400), older(400, 800)],
		});
		await first.service.sync(row);
		const carried = first.settled.at(-1)?.backfill ?? null;

		const second = harness({
			backfillPages: [older(400, 0), older(400, 400), older(400, 800)],
		});
		await second.service.sync({ ...row, backfill: carried } as MailboxSync);

		expect(second.backfillLinks).toEqual(["back-2"]);
		expect(second.stored.at(0)?.rfcMessageId).toBe("old-800@acme.com");
		expect(planOf(second.settled.at(-1)?.backfill).state).toBe("done");
	});

	it("never starts again once the backfill is done", async () => {
		const kit = harness({ backfillPages: [older(1, 0)] });
		await kit.service.sync(row);
		const done = kit.settled.at(-1)?.backfill ?? null;

		const again = harness({ backfillPages: [older(1, 0)] });
		await again.service.sync({ ...row, backfill: done } as MailboxSync);

		expect(again.backfillLinks).toHaveLength(0);
		expect(again.stored).toHaveLength(0);
	});

	it("pauses the backfill on a quota error and keeps the position", async () => {
		const kit = harness({
			backfillPage: (link) =>
				link === null
					? {
							outcome: "rate-limited",
							reason: "Too many requests",
							retryAfterMs: 30_000,
						}
					: { outcome: "failed", reason: "unreachable", retryable: true },
		});

		const outcome = await kit.service.sync(row);

		expect(outcome.status).toBe("rate-limited");
		expect(kit.rateLimited).toEqual([30_000]);
		expect(planOf(kit.settled.at(-1)?.backfill).state).toBe("running");
	});
});
