import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type {
	Db,
	ImapAccountModel as ImapAccount,
	MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { actWithoutPlans, actWithTestPlans } from "@crm/db/test-plans";
import {
	classifyConnectError,
	type ImapClientFactory,
	type ImapConnectFailure,
	type ImapFolder,
	type ImapSession,
	imapServerError,
} from "../src/imap/imap.client";
import { IMAP } from "../src/imap/imap.config";
import type { ImapCredentialService } from "../src/imap/imap-credentials";
import { parseImapCursor } from "../src/imap/imap-cursor";
import { ImapSyncService } from "../src/imap/imap-sync.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";
import type {
	IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";

type FakeMessage = { uid: number; from: string; to: string; id: string };

type FakeFolder = ImapFolder & { uidValidity: string; messages: FakeMessage[] };

const account = {
	id: "acc-1",
	userId: "user-1",
	email: "Rep@Example.com",
	host: "imap.example.com",
	port: 993,
	secure: true,
	username: "rep@example.com",
	secret: "sealed",
	importSince: null,
	updatedAt: new Date("2025-01-01T00:00:00Z"),
} as unknown as ImapAccount;

const MINUTE_MS = 60_000;

function row(
	cursor: string | null = null,
	lastSyncedAt: Date | null = new Date(),
): MailboxSync {
	return {
		id: "sync-1",
		userId: "user-1",
		source: "imap:acc-1",
		cursor,
		autoCreate: true,
		status: "IDLE",
		lastSyncedAt,
		createdAt: new Date("2025-01-01T00:00:00Z"),
	} as unknown as MailboxSync;
}

function refusal(
	outcome: ImapConnectFailure["outcome"],
	responseCode: string | null = null,
): ImapConnectFailure {
	return { outcome, reason: `${outcome} failure`, responseCode };
}

function message(uid: number, from: string, to: string): FakeMessage {
	return { uid, from, to, id: `<m-${uid}@example.com>` };
}

function source(entry: FakeMessage): Buffer {
	return Buffer.from(
		[
			`Message-ID: ${entry.id}`,
			`From: ${entry.from}`,
			`To: ${entry.to}`,
			"Subject: hello",
			"Date: Mon, 01 Sep 2025 10:00:00 +0000",
			"",
			`body ${entry.uid}`,
		].join("\r\n"),
	);
}

function harness(options: {
	folders: FakeFolder[];
	connect?: "ok" | ImapConnectFailure;
	fetchFails?: unknown;
	claimed?: boolean;
	cursor?: string | null;
	sinceUids?: number[];
	plan?: string | null;
	threads?: number;
}) {
	const plan = options.plan ?? null;

	const stored: { mailbox: string; message: IncomingMessage }[] = [];
	const settled: { cursor?: string | null; status: string }[] = [];
	const failed: { reason: string; retryAfterMs?: number }[] = [];
	const reconnect: string[] = [];
	const retrying: { retryAfterMs: number; reason?: string }[] = [];
	const opened: string[] = [];
	const fetched: { folder: string; range: string }[] = [];
	const asked: Date[] = [];
	let closed = 0;
	let saved: string | null = null;
	let current: FakeFolder | null = null;

	const session: ImapSession = {
		async folders() {
			return options.folders.map(({ path, specialUse, selectable }) => ({
				path,
				specialUse,
				selectable,
			}));
		},
		async open(path) {
			current = options.folders.find((folder) => folder.path === path) ?? null;
			if (!current) throw new Error(`no folder ${path}`);
			opened.push(path);
			const top = Math.max(0, ...current.messages.map((entry) => entry.uid));
			return {
				uidValidity: current.uidValidity,
				uidNext: top + 1,
				exists: current.messages.length,
			};
		},
		async uidsSince(when: Date) {
			asked.push(when);
			return options.sinceUids ?? [];
		},
		async *fetch(range) {
			if (!current) throw new Error("no folder open");
			fetched.push({ folder: current.path, range });
			if (options.fetchFails) throw options.fetchFails;
			const [from, to] = range.split(":").map(Number);
			for (const entry of current.messages) {
				if (entry.uid >= (from ?? 0) && entry.uid <= (to ?? 0)) {
					yield { uid: entry.uid, source: source(entry), internalDate: null };
				}
			}
		},
		async close() {
			closed += 1;
		},
	};

	const clients = {
		async connect() {
			const outcome = options.connect ?? "ok";
			if (outcome === "ok") return { outcome, session };
			return outcome;
		},
	} as unknown as ImapClientFactory;

	const credentials = {
		open: () => "password",
	} as unknown as ImapCredentialService;

	const state = {
		async get() {
			return row(options.cursor ?? null);
		},
		async remove() {},
		async markRunning() {},
		async markNeedsReconnect(_id: string, reason: string) {
			reconnect.push(reason);
		},
		async markFailed(_id: string, reason: string, retryAfterMs?: number) {
			failed.push({ reason, retryAfterMs });
		},
		async markRateLimited(_id: string, retryAfterMs: number, reason?: string) {
			retrying.push({ retryAfterMs, reason });
		},
		async claimManual() {
			return options.claimed ?? true;
		},
		async settle(
			_id: string,
			update: { cursor?: string | null; status: string },
		) {
			settled.push({ ...update, cursor: update.cursor ?? saved });
		},
	} as unknown as SyncStateService;

	const threads = {
		async context(mailbox: string) {
			return {
				ourAddresses: new Set<string>([mailbox.toLowerCase()]),
				ourDomains: new Set<string>(),
				suppressedDomains: new Set<string>(),
				suppressedEmails: new Set<string>(),
			};
		},
		async store(
			_row: MailboxSync,
			_options: { origin: string },
			parsed: IncomingMessage,
			context: { ourAddresses: ReadonlySet<string> },
		) {
			stored.push({
				mailbox: [...context.ourAddresses].join(","),
				message: parsed,
			});
			return true;
		},
	} as unknown as ThreadWriterService;

	const db = {
		imapAccount: { findUnique: async () => account },
		mailboxSync: {
			updateMany: async (args: { data: { cursor: string } }) => {
				saved = args.data.cursor;
				return { count: 1 };
			},
		},
		appSetting: { findUnique: async () => ({ plan }) },
		emailThread: {
			count: async () => (options.threads ?? 0) + stored.length,
		},
	} as unknown as Db;

	const service = new ImapSyncService(db, clients, credentials, state, threads);

	return {
		service,
		stored,
		settled,
		failed,
		reconnect,
		retrying,
		opened,
		fetched,
		closed: () => closed,
		get since() {
			return asked[0] ?? null;
		},
	};
}

const gmail = (options: {
	sent: FakeMessage[];
	all: FakeMessage[];
}): FakeFolder[] => [
	{
		path: "INBOX",
		specialUse: null,
		selectable: true,
		uidValidity: "1",
		messages: options.all,
	},
	{
		path: "[Gmail]/Sent Mail",
		specialUse: "\\Sent",
		selectable: true,
		uidValidity: "2",
		messages: options.sent,
	},
	{
		path: "[Gmail]/All Mail",
		specialUse: "\\All",
		selectable: true,
		uidValidity: "3",
		messages: options.all,
	},
];

beforeAll(actWithTestPlans);

afterAll(actWithoutPlans);

describe("ImapSyncService", () => {
	it("reads Sent before All Mail and imports the whole history newest first", async () => {
		const h = harness({
			folders: gmail({
				sent: [message(1, "rep@example.com", "ada@acme.com")],
				all: [
					message(10, "ada@acme.com", "rep@example.com"),
					message(11, "rep@example.com", "ada@acme.com"),
					message(12, "bob@acme.com", "rep@example.com"),
				],
			}),
		});

		const outcome = await h.service.sync(row());

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBe(4);
		expect(h.opened).toEqual(["[Gmail]/Sent Mail", "[Gmail]/All Mail"]);
		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-1@example.com",
			"m-10@example.com",
			"m-11@example.com",
			"m-12@example.com",
		]);
		expect(h.stored.every((entry) => entry.mailbox === "rep@example.com")).toBe(
			true,
		);
		expect(h.closed()).toBe(1);

		const cursor = parseImapCursor(h.settled.at(-1)?.cursor);
		expect(cursor.folders["[Gmail]/Sent Mail"]).toEqual({
			uidValidity: "2",
			lastUid: 1,
			backfillUid: null,
			floorUid: 1,
		});
		expect(cursor.folders["[Gmail]/All Mail"]).toEqual({
			uidValidity: "3",
			lastUid: 12,
			backfillUid: null,
			floorUid: 1,
		});
	});

	it("only fetches mail above the cursor on the next run", async () => {
		const folders = gmail({
			sent: [],
			all: [
				message(10, "ada@acme.com", "rep@example.com"),
				message(13, "ada@acme.com", "rep@example.com"),
			],
		});

		const cursor = JSON.stringify({
			v: 1,
			folders: {
				"[Gmail]/Sent Mail": {
					uidValidity: "2",
					lastUid: 0,
					backfillUid: null,
					floorUid: 1,
				},
				"[Gmail]/All Mail": {
					uidValidity: "3",
					lastUid: 10,
					backfillUid: null,
					floorUid: 1,
				},
			},
		});

		const h = harness({ folders, cursor });
		const outcome = await h.service.sync(row(cursor));

		expect(outcome.messagesWritten).toBe(1);
		expect(h.stored[0]?.message.rfcMessageId).toBe("m-13@example.com");
		expect(h.fetched).toEqual([{ folder: "[Gmail]/All Mail", range: "11:13" }]);
	});

	it("starts over in a folder whose uid validity changed", async () => {
		const folders = gmail({
			sent: [],
			all: [message(5, "ada@acme.com", "rep@example.com")],
		});
		const cursor = JSON.stringify({
			v: 1,
			folders: {
				"[Gmail]/All Mail": {
					uidValidity: "old",
					lastUid: 5,
					backfillUid: null,
					floorUid: 1,
				},
			},
		});

		const h = harness({ folders, cursor });
		await h.service.sync(row(cursor));

		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-5@example.com",
		]);
	});

	it("respects an import-since floor", async () => {
		const folders = gmail({
			sent: [],
			all: [
				message(1, "old@acme.com", "rep@example.com"),
				message(2, "old@acme.com", "rep@example.com"),
				message(3, "new@acme.com", "rep@example.com"),
			],
		});

		const h = harness({ folders, sinceUids: [3] });
		const since = { ...account, importSince: new Date("2025-01-01") };
		(h.service as unknown as { db: Db }).db = {
			imapAccount: { findUnique: async () => since },
			mailboxSync: { updateMany: async () => ({ count: 1 }) },
			appSetting: { findUnique: async () => ({ plan: null }) },
			emailThread: { count: async () => 0 },
		} as unknown as Db;

		await h.service.sync(row());

		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-3@example.com",
		]);
	});

	it("pulls back the floor when the plan says less history", async () => {
		const folders = gmail({
			sent: [],
			all: [
				message(1, "old@acme.com", "rep@example.com"),
				message(2, "new@acme.com", "rep@example.com"),
			],
		});

		const h = harness({ folders, sinceUids: [2], plan: "small" });
		const wide = { ...account, importSince: new Date("2015-01-01") };
		(h.service as unknown as { db: Db }).db = {
			imapAccount: { findUnique: async () => wide },
			mailboxSync: { updateMany: async () => ({ count: 1 }) },
			appSetting: { findUnique: async () => ({ plan: "small" }) },
			emailThread: { count: async () => 0 },
		} as unknown as Db;

		await h.service.sync(row());

		expect(h.since).not.toBeNull();
		expect(h.since?.getFullYear()).toBe(new Date().getFullYear());
		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-2@example.com",
		]);
	});

	it("narrows the backfill range to the threads the plan still allows", async () => {
		const all = Array.from({ length: 10 }, (_, at) =>
			message(at + 1, `p${at}@acme.com`, "rep@example.com"),
		);
		const h = harness({
			folders: gmail({ sent: [], all }),
			plan: "small",
			threads: 496,
			sinceUids: [1],
		});

		await h.service.sync(row());

		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-7@example.com",
			"m-8@example.com",
			"m-9@example.com",
			"m-10@example.com",
		]);
		expect(h.fetched.map((entry) => entry.range)).toEqual(["7:10"]);

		const cursor = parseImapCursor(h.settled.at(-1)?.cursor);
		expect(cursor.folders["[Gmail]/All Mail"]?.backfillUid).toBeNull();
	});

	it("stops cleanly when its deadline has passed", async () => {
		const h = harness({
			folders: gmail({
				sent: [],
				all: [message(1, "ada@acme.com", "rep@example.com")],
			}),
		});

		const outcome = await h.service.sync(row(), Date.now() - 1);

		expect(outcome.status).toBe("synced");
		expect(h.stored).toHaveLength(0);
		expect(h.opened).toEqual([]);
		expect(h.closed()).toBe(1);
	});

	it("retries a refused sign-in instead of locking the mailbox", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: refusal("auth", "AUTHENTICATIONFAILED"),
		});

		const outcome = await h.service.sync(row());

		expect(outcome.status).toBe("rate-limited");
		expect(h.reconnect).toEqual([]);
		expect(h.retrying).toEqual([
			{ retryAfterMs: IMAP.auth.backoffBaseMs, reason: "auth failure" },
		]);
		expect(h.settled).toEqual([]);
	});

	it("asks for a reconnect once a refused sign-in outlasts the grace period", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: refusal("auth", "AUTHENTICATIONFAILED"),
		});
		const longAgo = new Date(
			Date.now() - IMAP.auth.permanentAfterMs - MINUTE_MS,
		);

		const outcome = await h.service.sync(row(null, longAgo));

		expect(outcome.status).toBe("reconnect");
		expect(h.reconnect).toEqual(["auth failure"]);
		expect(h.retrying).toEqual([]);
	});

	it("never locks a mailbox for a temporary refusal, however long it lasts", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: refusal("refused", "UNAVAILABLE"),
		});
		const longAgo = new Date(
			Date.now() - IMAP.auth.permanentAfterMs - MINUTE_MS,
		);

		const outcome = await h.service.sync(row(null, longAgo));

		expect(outcome.status).toBe("rate-limited");
		expect(h.reconnect).toEqual([]);
		expect(h.retrying).toEqual([
			{ retryAfterMs: IMAP.auth.backoffCapMs, reason: "refused failure" },
		]);
	});

	it("retries an unreachable server quietly and with a growing backoff", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: refusal("unreachable"),
		});

		const outcome = await h.service.sync(
			row(null, new Date(Date.now() - 4 * MINUTE_MS)),
		);

		expect(outcome.status).toBe("rate-limited");
		expect(h.failed).toEqual([]);
		expect(h.retrying).toHaveLength(1);
		expect(h.retrying[0]?.reason).toBeUndefined();
		expect(h.retrying[0]?.retryAfterMs).toBeGreaterThanOrEqual(4 * MINUTE_MS);
		expect(h.retrying[0]?.retryAfterMs).toBeLessThan(5 * MINUTE_MS);
	});

	it("marks a server unreachable past the grace period as failed and keeps retrying", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: refusal("unreachable"),
		});
		const longAgo = new Date(
			Date.now() - IMAP.auth.permanentAfterMs - MINUTE_MS,
		);

		const outcome = await h.service.sync(row(null, longAgo));

		expect(outcome.status).toBe("failed");
		expect(h.failed).toEqual([
			{
				reason: "unreachable failure",
				retryAfterMs: IMAP.auth.backoffCapMs,
			},
		]);
	});

	it("keeps the position and retries when the connection drops mid-sync", async () => {
		const dropped = Object.assign(new Error("Connection not available"), {
			code: "NoConnection",
		});
		const h = harness({
			folders: gmail({
				sent: [message(1, "rep@example.com", "ada@acme.com")],
				all: [message(10, "ada@acme.com", "rep@example.com")],
			}),
			fetchFails: dropped,
		});

		const outcome = await h.service.sync(row());

		expect(outcome.status).toBe("rate-limited");
		expect(h.failed).toEqual([]);
		expect(h.reconnect).toEqual([]);
		expect(h.retrying).toHaveLength(1);
		expect(h.closed()).toBe(1);
	});

	it("syncs again on the next run after a temporary failure", async () => {
		const folders = gmail({
			sent: [],
			all: [message(10, "ada@acme.com", "rep@example.com")],
		});
		const first = harness({ folders, connect: refusal("unreachable") });
		expect((await first.service.sync(row())).status).toBe("rate-limited");

		const second = harness({ folders });
		const outcome = await second.service.sync(row());

		expect(outcome.status).toBe("synced");
		expect(outcome.messagesWritten).toBe(1);
	});

	it("does not run a manual sync beside a sync that holds the mailbox", async () => {
		const h = harness({
			folders: gmail({
				sent: [],
				all: [message(10, "ada@acme.com", "rep@example.com")],
			}),
			claimed: false,
		});

		const outcome = await h.service.runManual("user-1", "imap:acc-1");

		expect(outcome?.status).toBe("skipped");
		expect(h.opened).toEqual([]);
		expect(h.stored).toEqual([]);
	});

	it("runs a manual sync once it holds the mailbox", async () => {
		const h = harness({
			folders: gmail({
				sent: [],
				all: [message(10, "ada@acme.com", "rep@example.com")],
			}),
		});

		const outcome = await h.service.runManual("user-1", "imap:acc-1");

		expect(outcome?.status).toBe("synced");
		expect(outcome?.messagesWritten).toBe(1);
	});
});

describe("classifyConnectError", () => {
	const loginError = (fields: {
		code?: string;
		serverResponseCode?: string;
		responseStatus?: string;
	}) =>
		imapServerError.parse(
			Object.assign(new Error("Command failed"), {
				authenticationFailed: true,
				...fields,
			}),
		);

	it("reads a definitive code as a refused sign-in", () => {
		const failure = classifyConnectError(
			loginError({
				serverResponseCode: "AUTHENTICATIONFAILED",
				responseStatus: "NO",
			}),
		);

		expect(failure.outcome).toBe("auth");
		expect(failure.responseCode).toBe("AUTHENTICATIONFAILED");
	});

	it("reads a refusal without a code as a refused sign-in", () => {
		expect(
			classifyConnectError(loginError({ responseStatus: "NO" })).outcome,
		).toBe("auth");
	});

	it("reads a temporary code during login as temporary", () => {
		const failure = classifyConnectError(
			loginError({ serverResponseCode: "UNAVAILABLE", responseStatus: "NO" }),
		);

		expect(failure.outcome).toBe("refused");
		expect(failure.responseCode).toBe("UNAVAILABLE");
	});

	it("reads a connection lost during login as unreachable, not as a refusal", () => {
		for (const code of IMAP.connect.goneCodes) {
			expect(classifyConnectError(loginError({ code })).outcome).toBe(
				"unreachable",
			);
		}
	});

	it("reads network and timeout codes as unreachable", () => {
		for (const code of ["ECONNRESET", "ETIMEDOUT", "GREETING_TIMEOUT"]) {
			expect(
				classifyConnectError(
					imapServerError.parse(Object.assign(new Error("boom"), { code })),
				).outcome,
			).toBe("unreachable");
		}
	});

	it("reads anything else as a failed connection", () => {
		expect(
			classifyConnectError(
				imapServerError.parse(new Error("certificate expired")),
			).outcome,
		).toBe("failed");
		expect(imapServerError.parse("not an error object").code).toBe("");
	});
});
