import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import { Logger } from "@nestjs/common";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import {
	planBackfill,
	readBackfill,
	serialiseBackfill,
} from "../src/mailbox/backfill-cursor";
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
import type { GraphClient, GraphMessage } from "../src/microsoft/graph.client";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

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
	backfill: string[][];
	poisoned: readonly string[];
	plan?: string;
	expireOnce?: string;
}) {
	const persisted: Persisted = {
		cursor: "1000",
		backfill: options.plan ?? null,
	};
	const stored: string[] = [];
	let expired: string | undefined;

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
		async listMessages(_token: string, request: { pageToken?: string }) {
			const expiring = options.expireOnce ?? null;
			if (expired === undefined && request.pageToken === expiring) {
				expired = request.pageToken;
				return { outcome: "cursor-invalid" as const, reason: "expired" };
			}
			const at = Number(request.pageToken ?? 0);
			const next =
				at + 1 < options.backfill.length ? String(at + 1) : undefined;
			return ok({
				messages: (options.backfill[at] ?? []).map((id) => ({ id })),
				nextPageToken: next,
			});
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
			backfill: [[...POISONED, "good"]],
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
			backfill: [["backfill-poison"]],
			poisoned,
		});

		for (let tick = 1; tick <= TICKS; tick += 1) await kit.tick();

		expect(kit.persisted.cursor).toBe("1100");
		expect(kit.stored).toEqual(["good"]);
		warnedOnce(warn, poisoned);
	});
});

describe("a Gmail backfill page the tick finishes in the last phase", () => {
	it("drops the counts of that page when the plan moves on", async () => {
		spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		useTinySizes();
		const kit = gmailKit({
			history: [],
			backfill: [["p0"], ["good"]],
			poisoned: ["p0"],
			plan: serialiseBackfill({
				...planBackfill({ before: new Date(), floor: null }),
				phase: "all",
			}),
		});

		for (let tick = 1; tick <= MESSAGE_FAILURES.maxAttempts; tick += 1) {
			await kit.tick();
		}

		const read = readBackfill(kit.persisted.backfill);
		expect(read.outcome === "ok" && read.backfill.position).toBe("1");
		expect(read.outcome === "ok" && read.backfill.failures).toBeUndefined();
	});
});

function graphMessage(id: string, at: string): GraphMessage {
	return {
		id,
		internetMessageId: `<${id}@acme.example.com>`,
		from: { emailAddress: { address: SENDER, name: "Jane" } },
		toRecipients: [{ emailAddress: { address: MAILBOX } }],
		sentDateTime: at,
		receivedDateTime: at,
		subject: "Pricing",
		body: { contentType: "text", content: "hello" },
	};
}

describe("an Outlook tick that stops before a page it read before", () => {
	it("keeps the count of the message on the unread page", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const persisted: Persisted = {
			cursor: "2025-08-01T00:00:00.000Z",
			backfill: null,
		};
		const first = [
			graphMessage("a", "2025-09-01T00:00:00.000Z"),
			graphMessage("b", "2025-09-02T00:00:00.000Z"),
		];
		const second = [graphMessage("poison", "2025-09-03T00:00:00.000Z")];
		let short = false;

		const graph = {
			async me() {
				return ok({ mail: MAILBOX });
			},
			async folder(_token: string, name: string) {
				return ok({ id: `folder-${name}` });
			},
			async listMessages(
				_token: string,
				request: { order?: string; after: Date },
			) {
				if (request.order === "desc") return ok({ value: [] });
				return ok({
					value: first.filter(
						(message) =>
							new Date(message.receivedDateTime ?? "") >= request.after,
					),
					"@odata.nextLink": "page-2",
				});
			},
			async nextPage() {
				return ok({ value: second });
			},
		} as unknown as GraphClient;

		const db = {
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
				if (parsed.outlookMessageId === "poison") {
					throw new Error(`insert failed for ${SENDER}`);
				}
				if (short && parsed.outlookMessageId === "a") await Bun.sleep(150);
				return true;
			},
		} as unknown as ThreadWriterService;

		const service = new OutlookSyncService(db, graph, tokens, state, threads);

		const tick = async (deadlineAt?: number) => {
			try {
				await service.sync(
					{
						id: "sync-1",
						userId: "user-1",
						source: "outlook",
						cursor: persisted.cursor,
						backfill: persisted.backfill,
						importSince: null,
						autoCreate: true,
						createFrom: null,
						status: "IDLE",
					} as unknown as MailboxSync,
					deadlineAt,
				);
			} catch {
				return;
			}
		};

		await tick();
		short = true;
		await tick(Date.now() + 50);
		short = false;
		await tick();
		await tick();

		const lines = warn.mock.calls
			.map((call) => JSON.stringify(call[0]))
			.filter((line) => line.includes(`"poison"`));
		expect(lines).toHaveLength(1);
	});
});

describe("a Gmail backfill page token that expires after a finished page", () => {
	it("keeps the counts of the page the restart reads again", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const kit = gmailKit({
			history: [],
			backfill: [["p0"], ["good"]],
			poisoned: ["p0"],
			plan: serialiseBackfill({
				...planBackfill({ before: new Date(), floor: null }),
				phase: "all",
			}),
			expireOnce: "1",
		});

		for (let tick = 1; tick <= TICKS; tick += 1) await kit.tick();

		expect(kit.stored).toEqual(["good"]);
		warnedOnce(warn, ["p0"]);
	});
});
