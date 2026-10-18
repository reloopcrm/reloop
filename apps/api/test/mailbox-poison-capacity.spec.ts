import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type {
	Db,
	ImapAccountModel as ImapAccount,
	MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Logger } from "@nestjs/common";
import type { ImapClientFactory, ImapSession } from "../src/imap/imap.client";
import type { ImapCredentialService } from "../src/imap/imap-credentials";
import { parseImapCursor } from "../src/imap/imap-cursor";
import { ImapSyncService } from "../src/imap/imap-sync.service";
import { readBackfill } from "../src/mailbox/backfill-cursor";
import { MESSAGE_FAILURES } from "../src/mailbox/mailbox.config";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import type { GraphClient, GraphMessage } from "../src/microsoft/graph.client";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

type GraphPage = { value: GraphMessage[]; "@odata.nextLink"?: string };

type Persisted = { cursor: string | null; backfill: string | null };

const MAILBOX = "rep@example.com";
const SENDER = "jane@acme.example.com";
const POISONED = 60;

const ok = <T>(data: T) => ({ outcome: "ok" as const, data });

afterEach(() => {
	spyOn(Logger.prototype, "warn").mockRestore();
});

function graphMessage(id: string): GraphMessage {
	return {
		id,
		internetMessageId: `<${id}@acme.example.com>`,
		from: { emailAddress: { address: SENDER, name: "Jane" } },
		toRecipients: [{ emailAddress: { address: MAILBOX } }],
		sentDateTime: "2025-09-01T00:00:00.000Z",
		receivedDateTime: "2025-09-01T00:00:00.000Z",
		subject: "Pricing",
		body: { contentType: "text", content: "hello" },
	};
}

function outlookKit(options: {
	persisted: Persisted;
	forward: (call: number) => GraphMessage[];
	back: GraphMessage[];
	nextPage?: () =>
		| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
		| ReturnType<typeof ok<{ value: GraphMessage[] }>>;
	poisoned: (id: string) => boolean;
}) {
	const stored: string[] = [];
	let forwardCalls = 0;

	const graph = {
		async me() {
			return ok({ mail: MAILBOX });
		},
		async folder(_token: string, name: string) {
			return ok({ id: `folder-${name}` });
		},
		async listMessages(
			_token: string,
			request: { order?: string; folder?: string },
		) {
			if (request.order !== "desc") {
				forwardCalls += 1;
				const page: GraphPage = {
					value: options.forward(forwardCalls),
				};
				if (options.nextPage) page["@odata.nextLink"] = "next-1";
				return ok(page);
			}
			return ok({ value: request.folder ? [] : options.back });
		},
		async nextPage() {
			return options.nextPage?.() ?? ok({ value: [] });
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
				options.persisted.cursor = update.cursor;
			}
			if (update.backfill !== undefined) {
				options.persisted.backfill = update.backfill;
			}
		},
		async saveBackfill(_id: string, backfill: string | null) {
			options.persisted.backfill = backfill;
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
			const id = parsed.outlookMessageId ?? "";
			if (options.poisoned(id)) throw new Error(`insert failed for ${SENDER}`);
			stored.push(id);
			return true;
		},
	} as unknown as ThreadWriterService;

	const service = new OutlookSyncService(db, graph, tokens, state, threads);

	const tick = async () => {
		try {
			await service.sync({
				id: "sync-1",
				userId: "user-1",
				source: "outlook",
				cursor: options.persisted.cursor,
				backfill: options.persisted.backfill,
				importSince: null,
				autoCreate: true,
				createFrom: null,
				status: "IDLE",
			} as unknown as MailboxSync);
		} catch {
			return;
		}
	};

	return { tick, stored };
}

describe("more poisoned messages than the tracked limit", () => {
	it("lets an IMAP chunk finish in a bounded number of ticks", async () => {
		spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const persisted: Persisted = { cursor: null, backfill: null };
		const total = POISONED;
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
				return { uidValidity: "1", uidNext: total + 2, exists: total + 1 };
			},
			async uidsSince() {
				return [];
			},
			async *fetch(range) {
				const [from, to] = range.split(":").map(Number);
				for (let uid = from ?? 1; uid <= (to ?? 0); uid += 1) {
					yield { uid, source: source(uid), internalDate: null };
				}
			},
			async close() {},
		};

		const stored: string[] = [];
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
				if (parsed.rfcMessageId !== `m-${total + 1}@acme.example.com`) {
					throw new Error(`insert failed for ${SENDER}`);
				}
				stored.push(parsed.rfcMessageId);
				return true;
			},
		} as unknown as ThreadWriterService;

		const save = async (args: { data: { cursor?: string } }) => {
			if (args.data.cursor !== undefined) persisted.cursor = args.data.cursor;
			return { count: 1 };
		};

		const db = {
			imapAccount: { findUnique: async () => account },
			mailboxSync: {
				update: save,
				updateMany: save,
				findUnique: async () => ({ cursor: persisted.cursor }),
			},
			appSetting: { findUnique: async () => ({ plan: null }) },
			emailThread: { count: async () => 0 },
		} as unknown as Db;

		const state = {
			async remove() {},
			async markRunning() {},
			async markNeedsReconnect() {},
			async markFailed() {},
			async settle(_id: string, update: { cursor?: string | null }) {
				if (update.cursor !== undefined) persisted.cursor = update.cursor;
			},
		} as unknown as SyncStateService;

		const service = new ImapSyncService(
			db,
			{
				connect: async () => ({ outcome: "ok" as const, session }),
			} as unknown as ImapClientFactory,
			{ open: () => "password" } as unknown as ImapCredentialService,
			state,
			threads,
		);

		const bound = total * MESSAGE_FAILURES.maxAttempts + 5;
		for (let tick = 1; tick <= bound; tick += 1) {
			await service.sync({
				id: "sync-1",
				userId: "user-1",
				source: "imap:acc-1",
				cursor: persisted.cursor,
				autoCreate: true,
				status: "IDLE",
			} as unknown as MailboxSync);
		}

		expect(total).toBeGreaterThan(50);
		expect(stored).toEqual([`m-${total + 1}@acme.example.com`]);
		expect(parseImapCursor(persisted.cursor).folders.INBOX?.backfillUid).toBe(
			null,
		);
	});

	it("lets an Outlook backfill page finish in a bounded number of ticks", async () => {
		spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const total = POISONED;
		const persisted: Persisted = {
			cursor: "2025-08-01T00:00:00.000Z",
			backfill: null,
		};
		const back = [
			...Array.from({ length: total }, (_, at) => graphMessage(`p${at}`)),
			graphMessage("good"),
		];
		const kit = outlookKit({
			persisted,
			forward: () => [],
			back,
			poisoned: (id) => id.startsWith("p"),
		});

		const bound = total * MESSAGE_FAILURES.maxAttempts + 5;
		for (let tick = 1; tick <= bound; tick += 1) await kit.tick();

		expect(total).toBeGreaterThan(50);
		expect(kit.stored).toEqual(["good"]);
		const read = readBackfill(persisted.backfill);
		expect(read.outcome === "ok" && read.backfill.state).toBe("done");
	});
});

describe("an Outlook message skipped before a rate-limited page", () => {
	it("keeps the skip across ticks and warns once", async () => {
		const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => {});
		const persisted: Persisted = {
			cursor: "2025-08-01T00:00:00.000Z",
			backfill: JSON.stringify({
				v: 1,
				state: "done",
				phase: "all",
				position: null,
				before: "2025-08-01T00:00:00.000Z",
				floor: null,
				reached: null,
				failures: [{ id: "poison", attempts: 2, lanes: ["forward"] }],
			}),
		};

		let limited = true;
		const kit = outlookKit({
			persisted,
			forward: () => [graphMessage("poison")],
			back: [],
			nextPage: () =>
				limited
					? { outcome: "rate-limited", reason: "slow down", retryAfterMs: 1 }
					: ok({ value: [] }),
			poisoned: (id) => id === "poison",
		});

		await kit.tick();
		limited = false;
		await kit.tick();
		await kit.tick();

		const lines = warn.mock.calls
			.map((call) => JSON.stringify(call[0]))
			.filter((line) => line.includes("poison"));
		expect(lines).toHaveLength(1);

		const read = readBackfill(persisted.backfill);
		expect(read.outcome === "ok" && read.backfill.failures).toEqual([
			{
				id: "poison",
				attempts: MESSAGE_FAILURES.maxAttempts,
				lanes: ["forward"],
			},
		]);
	});
});
