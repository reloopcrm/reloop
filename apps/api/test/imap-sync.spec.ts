import { describe, expect, it } from "bun:test";
import type {
	Db,
	ImapAccountModel as ImapAccount,
	MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type {
	ImapClientFactory,
	ImapFolder,
	ImapSession,
} from "../src/imap/imap.client";
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
} as unknown as ImapAccount;

function row(cursor: string | null = null): MailboxSync {
	return {
		id: "sync-1",
		userId: "user-1",
		source: "imap:acc-1",
		cursor,
		autoCreate: true,
		status: "IDLE",
	} as unknown as MailboxSync;
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
	connect?: "ok" | "auth" | "unreachable";
	cursor?: string | null;
	sinceUids?: number[];
	plan?: string | null;
}) {
	const plan = options.plan ?? null;

	const stored: { mailbox: string; message: IncomingMessage }[] = [];
	const settled: { cursor?: string | null; status: string }[] = [];
	const failed: string[] = [];
	const reconnect: string[] = [];
	const opened: string[] = [];
	const fetched: { folder: string; range: string }[] = [];
	const asked: Date[] = [];
	let closed = 0;
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
			return { outcome, reason: `${outcome} failure` };
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
		async markFailed(_id: string, reason: string) {
			failed.push(reason);
		},
		async settle(
			_id: string,
			update: { cursor?: string | null; status: string },
		) {
			settled.push(update);
		},
	} as unknown as SyncStateService;

	const threads = {
		async context() {
			return {
				ourAddresses: new Set<string>(),
				ourDomains: new Set<string>(),
				suppressedDomains: new Set<string>(),
				suppressedEmails: new Set<string>(),
			};
		},
		async store(
			_row: MailboxSync,
			storeOptions: { mailbox: string },
			parsed: IncomingMessage,
		) {
			stored.push({ mailbox: storeOptions.mailbox, message: parsed });
			return true;
		},
	} as unknown as ThreadWriterService;

	const db = {
		imapAccount: { findUnique: async () => account },
		mailboxSync: { update: async () => undefined },
		appSetting: { findUnique: async () => ({ plan }) },
		emailThread: { count: async () => 0 },
	} as unknown as Db;

	const service = new ImapSyncService(db, clients, credentials, state, threads);

	return {
		service,
		stored,
		settled,
		failed,
		reconnect,
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
			mailboxSync: { update: async () => undefined },
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

		const h = harness({ folders, sinceUids: [2], plan: "test" });
		const wide = { ...account, importSince: new Date("2015-01-01") };
		(h.service as unknown as { db: Db }).db = {
			imapAccount: { findUnique: async () => wide },
			mailboxSync: { update: async () => undefined },
			appSetting: { findUnique: async () => ({ plan: "test" }) },
			emailThread: { count: async () => 0 },
		} as unknown as Db;

		await h.service.sync(row());

		expect(h.since).not.toBeNull();
		expect(h.since?.getFullYear()).toBe(new Date().getFullYear());
		expect(h.stored.map((entry) => entry.message.rfcMessageId)).toEqual([
			"m-2@example.com",
		]);
	});

	it("marks a refused sign-in as needing reconnect", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: "auth",
		});

		const outcome = await h.service.sync(row());

		expect(outcome.status).toBe("reconnect");
		expect(h.reconnect).toEqual(["auth failure"]);
		expect(h.settled).toEqual([]);
	});

	it("marks an unreachable server as failed and retries later", async () => {
		const h = harness({
			folders: gmail({ sent: [], all: [] }),
			connect: "unreachable",
		});

		const outcome = await h.service.sync(row());

		expect(outcome.status).toBe("failed");
		expect(h.failed).toEqual(["unreachable failure"]);
	});
});
