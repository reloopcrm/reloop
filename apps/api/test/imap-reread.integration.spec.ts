import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import type { ImapClientFactory, ImapSession } from "../src/imap/imap.client";
import { ImapConnectionService } from "../src/imap/imap-connection.service";
import type { ImapCredentialService } from "../src/imap/imap-credentials";
import { parseImapCursor } from "../src/imap/imap-cursor";
import { ImapSyncService } from "../src/imap/imap-sync.service";
import { imapSourceFor } from "../src/mailbox/mailbox.constants";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "imap-reread-spec";
const domain = `reread-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;
const sender = `preview@${domain}`;
const messageId = `old-${suffix}@mail.test`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
	contactMemoryRequested: async () => true,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const participants = new ThreadParticipantsService(db, match, stamp, agent);
const threads = new ThreadWriterService(db, match, stamp, agent, participants);
const state = new SyncStateService(db);

const raw = Buffer.from(
	[
		`Message-ID: <${messageId}>`,
		`From: Old Sender <${sender}>`,
		`To: ${mailbox}`,
		"Subject: An old question",
		"Date: Mon, 01 Sep 2025 10:00:00 +0000",
		"",
		"body",
	].join("\r\n"),
);

let onOpen: (() => Promise<void>) | null = null;

const session: ImapSession = {
	async folders() {
		return [{ path: "INBOX", specialUse: null, selectable: true }];
	},
	async open() {
		await onOpen?.();
		return { uidValidity: "1", uidNext: 3, exists: 2 };
	},
	async uidsSince() {
		return [];
	},
	async *fetch(range) {
		const [from, to] = range.split(":").map(Number);
		if ((from ?? 0) <= 1 && (to ?? 0) >= 1) {
			yield { uid: 1, source: raw, internalDate: null };
		}
	},
	async close() {},
};

const clients = {
	async connect() {
		return { outcome: "ok", session };
	},
} as unknown as ImapClientFactory;

const credentials = {
	open: () => "password",
} as unknown as ImapCredentialService;

const sync = new ImapSyncService(db, clients, credentials, state, threads);

const connections = new ImapConnectionService(
	db,
	clients,
	credentials,
	state,
	stamp,
	participants,
);

let accountId = "";
let source = "";

async function counts() {
	const [contacts, messages, emailThreads] = await Promise.all([
		db.contact.count({ where: { email: sender } }),
		db.emailMessage.count({ where: { rfcMessageId: messageId } }),
		db.emailThread.count({ where: { rootMessageId: messageId } }),
	]);
	return { contacts, messages, emailThreads };
}

async function runSync() {
	const row = await state.get(userId, imapSourceFor(accountId));
	if (!row) throw new Error("no sync row");
	return sync.sync(row);
}

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.emailThread.deleteMany({ where: { rootMessageId: messageId } });
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.imapAccount.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Reread Rep", email: mailbox },
	});
	const account = await db.imapAccount.create({
		data: {
			userId,
			email: mailbox,
			host: "imap.example.test",
			username: mailbox,
			secret: "sealed",
		},
	});
	accountId = account.id;
	source = imapSourceFor(accountId);
	await db.mailboxSync.create({
		data: { userId, source, autoCreate: false, createFrom: "nobody" },
	});
});

afterAll(clean);

describe("turning creation on for an IMAP mailbox", () => {
	it("skips the sender while creation is off and finishes the backfill", async () => {
		await runSync();

		expect(await counts()).toEqual({
			contacts: 0,
			messages: 0,
			emailThreads: 0,
		});

		const row = await state.get(userId, source as never);
		const folder = parseImapCursor(row?.cursor).folders.INBOX;
		expect(folder?.backfillUid).toBeNull();
		expect(folder?.lastUid).toBe(2);
	});

	it("reads the history again and adds the skipped sender once", async () => {
		await connections.setCreateFrom(userId, accountId, "everyone");

		const rewound = await state.get(userId, source as never);
		const folder = parseImapCursor(rewound?.cursor).folders.INBOX;
		expect(folder?.backfillUid).toBe(2);
		expect(folder?.lastUid).toBe(2);
		expect(folder?.floorUid).toBe(1);

		await runSync();

		expect(await counts()).toEqual({
			contacts: 1,
			messages: 1,
			emailThreads: 1,
		});
	});

	it("does not duplicate the message when history is read a third time", async () => {
		await connections.setCreateFrom(userId, accountId, "everyone");
		await runSync();

		expect(await counts()).toEqual({
			contacts: 1,
			messages: 1,
			emailThreads: 1,
		});
	});

	it("leaves the cursor alone when creation is turned off", async () => {
		await runSync();
		const before = (await state.get(userId, source as never))?.cursor;

		await connections.setCreateFrom(userId, accountId, "nobody");

		const after = (await state.get(userId, source as never))?.cursor;
		expect(after).toBe(before);
	});

	it("keeps the rewind when a sync that started earlier saves afterwards", async () => {
		await clean();
		await db.user.create({
			data: { id: userId, name: "Reread Rep", email: mailbox },
		});
		const account = await db.imapAccount.create({
			data: {
				userId,
				email: mailbox,
				host: "imap.example.test",
				username: mailbox,
				secret: "sealed",
			},
		});
		accountId = account.id;
		source = imapSourceFor(accountId);
		await db.mailboxSync.create({
			data: { userId, source, autoCreate: false, createFrom: "nobody" },
		});

		await runSync();
		expect(await counts()).toEqual({
			contacts: 0,
			messages: 0,
			emailThreads: 0,
		});

		onOpen = async () => {
			onOpen = null;
			await connections.setCreateFrom(userId, accountId, "everyone");
		};
		await runSync();
		expect(onOpen).toBeNull();

		const rewound = await state.get(userId, source as never);
		const folder = parseImapCursor(rewound?.cursor).folders.INBOX;
		expect(folder?.backfillUid).toBe(2);
		expect(folder?.lastUid).toBe(2);

		await runSync();
		expect(await counts()).toEqual({
			contacts: 1,
			messages: 1,
			emailThreads: 1,
		});
	});
});
