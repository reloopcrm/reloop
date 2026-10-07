import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type {
	Db,
	ImapAccountModel as ImapAccount,
	MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Logger } from "@nestjs/common";
import type { GmailClient, GmailMessage } from "../src/google/gmail.client";
import { GmailSyncService } from "../src/google/gmail-sync.service";
import type { ImapClientFactory, ImapSession } from "../src/imap/imap.client";
import type { ImapCredentialService } from "../src/imap/imap-credentials";
import { parseImapCursor } from "../src/imap/imap-cursor";
import { ImapSyncService } from "../src/imap/imap-sync.service";
import { MESSAGE_FAILURES } from "../src/mailbox/mailbox.config";
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

const ok = <T>(data: T) => ({ outcome: "ok" as const, data });

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

function warnLines(spy: { mock: { calls: unknown[][] } }): string[] {
	return spy.mock.calls.map((call) => JSON.stringify(call[0]));
}

afterEach(() => {
	spyOn(Logger.prototype, "warn").mockRestore();
});

describe("a message the store always rejects", () => {
	it("is skipped by Gmail after the attempt limit and the cursor moves on", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const stored: string[] = [];
		const persisted: Persisted = {
			cursor: "1000",
			backfill: null,
		};

		const gmail = {
			async profile() {
				return ok({ emailAddress: MAILBOX, historyId: "9000" });
			},
			async listHistory(_token: string, request: { startHistoryId: string }) {
				const entries = [
					{ id: 1100, ids: ["poison"] },
					{ id: 1200, ids: ["next"] },
				].filter((entry) => entry.id > Number(request.startHistoryId));

				return ok({
					history: entries.map((entry) => ({
						id: String(entry.id),
						messagesAdded: entry.ids.map((id) => ({ message: { id } })),
					})),
					historyId: "1200",
				});
			},
			async listMessages() {
				return ok({ messages: [] });
			},
			async getMessage(_token: string, id: string) {
				return ok(gmailMessage(id));
			},
		} as unknown as GmailClient;

		const db = {
			emailMessage: { findMany: async () => [] },
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
				if (parsed.gmailMessageId === "poison") {
					throw new Error(`insert failed for ${SENDER}`);
				}
				stored.push(parsed.gmailMessageId ?? "");
				return true;
			},
		} as unknown as ThreadWriterService;

		const service = new GmailSyncService(db, gmail, tokens, state, threads);

		let thrown = 0;
		for (let tick = 1; tick <= MESSAGE_FAILURES.maxAttempts + 1; tick += 1) {
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
				thrown += 1;
			}
		}

		expect(thrown).toBe(MESSAGE_FAILURES.maxAttempts - 1);
		expect(stored).toEqual(["next"]);
		expect(persisted.cursor).toBe("1200");

		const lines = warnLines(warn).filter((line) => line.includes("poison"));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("sync-1");
		expect(lines[0]).not.toContain("@");
	});
});

describe("an IMAP message the store always rejects", () => {
	it("is skipped after the attempt limit and the cursor moves on", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const stored: number[] = [];
		const persisted: Persisted = { cursor: null, backfill: null };
		const failed: string[] = [];

		const account = {
			id: "acc-1",
			userId: "user-1",
			email: MAILBOX,
			host: "imap.example.com",
			port: 993,
			secure: true,
			username: MAILBOX,
			secret: "sealed",
			importSince: null,
		} as unknown as ImapAccount;

		const source = (uid: number) =>
			Buffer.from(
				[
					`Message-ID: <m-${uid}@acme.example.com>`,
					`From: ${SENDER}`,
					`To: ${MAILBOX}`,
					"Subject: hello",
					"Date: Mon, 01 Sep 2025 10:00:00 +0000",
					"",
					`body ${uid}`,
				].join("\r\n"),
			);

		const session: ImapSession = {
			async folders() {
				return [{ path: "INBOX", specialUse: null, selectable: true }];
			},
			async open() {
				return { uidValidity: "1", uidNext: 3, exists: 2 };
			},
			async uidsSince() {
				return [];
			},
			async *fetch(range) {
				const [from, to] = range.split(":").map(Number);
				for (const uid of [1, 2]) {
					if (uid >= (from ?? 0) && uid <= (to ?? 0)) {
						yield { uid, source: source(uid), internalDate: null };
					}
				}
			},
			async close() {},
		};

		const clients = {
			connect: async () => ({ outcome: "ok" as const, session }),
		} as unknown as ImapClientFactory;

		const credentials = {
			open: () => "password",
		} as unknown as ImapCredentialService;

		const state = {
			async remove() {},
			async markRunning() {},
			async markNeedsReconnect() {},
			async markFailed(_id: string, reason: string) {
				failed.push(reason);
			},
			async settle(_id: string, update: { cursor?: string | null }) {
				if (update.cursor !== undefined) persisted.cursor = update.cursor;
			},
		} as unknown as SyncStateService;

		const threads = {
			async context() {
				return {
					ourAddresses: new Set<string>([MAILBOX]),
					ourDomains: new Set<string>(),
					suppressedDomains: new Set<string>(),
					suppressedEmails: new Set<string>(),
				};
			},
			async store(
				_row: MailboxSync,
				_options: { origin: string },
				parsed: IncomingMessage,
			) {
				if (parsed.rfcMessageId === "m-1@acme.example.com") {
					throw new Error(`insert failed for ${SENDER}`);
				}
				stored.push(2);
				return true;
			},
		} as unknown as ThreadWriterService;

		const db = {
			imapAccount: { findUnique: async () => account },
			mailboxSync: {
				update: async (args: { data: { cursor?: string } }) => {
					if (args.data.cursor !== undefined) {
						persisted.cursor = args.data.cursor;
					}
				},
			},
			appSetting: { findUnique: async () => ({ plan: null }) },
			emailThread: { count: async () => 0 },
		} as unknown as Db;

		const service = new ImapSyncService(
			db,
			clients,
			credentials,
			state,
			threads,
		);

		for (let tick = 1; tick <= MESSAGE_FAILURES.maxAttempts + 1; tick += 1) {
			await service.sync({
				id: "sync-1",
				userId: "user-1",
				source: "imap:acc-1",
				cursor: persisted.cursor,
				autoCreate: true,
				status: "IDLE",
			} as unknown as MailboxSync);
		}

		expect(failed).toHaveLength(MESSAGE_FAILURES.maxAttempts - 1);
		expect(stored).toEqual([2]);

		const folder = parseImapCursor(persisted.cursor).folders.INBOX;
		expect(folder?.lastUid).toBe(2);
		expect(folder?.backfillUid).toBeNull();

		const lines = warnLines(warn).filter((line) => line.includes("sync-1"));
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain("@");
	});
});

describe("an Outlook message the store always rejects", () => {
	it("is skipped after the attempt limit and the cursor moves on", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const stored: string[] = [];
		const persisted: Persisted = {
			cursor: "2025-08-01T00:00:00.000Z",
			backfill: null,
		};

		const graphMessage = (id: string, at: string): GraphMessage => ({
			id,
			internetMessageId: `<${id}@acme.example.com>`,
			from: { emailAddress: { address: SENDER, name: "Jane" } },
			toRecipients: [{ emailAddress: { address: MAILBOX } }],
			sentDateTime: at,
			receivedDateTime: at,
			subject: "Pricing",
			body: { contentType: "text", content: "hello" },
		});

		const graph = {
			async me() {
				return ok({ mail: MAILBOX });
			},
			async folder(_token: string, name: string) {
				return ok({ id: `folder-${name}` });
			},
			async listMessages(_token: string, request: { order?: string }) {
				if (request.order === "desc") return ok({ value: [] });
				return ok({
					value: [
						graphMessage("poison", "2025-09-01T00:00:00.000Z"),
						graphMessage("next", "2025-09-02T00:00:00.000Z"),
					],
				});
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
				stored.push(parsed.outlookMessageId ?? "");
				return true;
			},
		} as unknown as ThreadWriterService;

		const service = new OutlookSyncService(db, graph, tokens, state, threads);

		let thrown = 0;
		for (let tick = 1; tick <= MESSAGE_FAILURES.maxAttempts + 1; tick += 1) {
			try {
				await service.sync({
					id: "sync-1",
					userId: "user-1",
					source: "outlook",
					cursor: persisted.cursor,
					backfill: persisted.backfill,
					importSince: null,
					autoCreate: true,
					createFrom: null,
					status: "IDLE",
				} as unknown as MailboxSync);
			} catch {
				thrown += 1;
			}
		}

		expect(thrown).toBe(MESSAGE_FAILURES.maxAttempts - 1);
		expect(stored.at(-1)).toBe("next");
		expect(new Date(persisted.cursor ?? "").getTime()).toBeGreaterThanOrEqual(
			new Date("2025-09-02T00:00:00.000Z").getTime(),
		);

		const lines = warnLines(warn).filter((line) => line.includes("poison"));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("sync-1");
		expect(lines[0]).not.toContain("@");
	});
});
