import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync, Prisma } from "@crm/db";
import { CONTACT_LIMIT_MESSAGE, PLANS } from "@crm/db/plans";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { readCapacityUsage } from "../src/mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "contact-limit-spec";
const firstDomain = `first-${suffix}.test`;
const secondDomain = `second-${suffix}.test`;
const thirdDomain = `third-${suffix}.test`;
const ownDomain = `own-${suffix}.test`;
const adoptDomain = `adopt-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep@${ownDomain}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
} as unknown as AgentTriggerService;

const limitedAgent = {
	...agent,
	withCrmEvents: async () => {
		throw new Prisma.PrismaClientUnknownRequestError(
			`Invalid \`tx.contact.create()\` invocation: ${CONTACT_LIMIT_MESSAGE}`,
			{ clientVersion: Prisma.prismaVersion.client },
		);
	},
} as unknown as AgentTriggerService;

const fullDb = new Proxy(db, {
	get(target, key) {
		if (key === "appSetting") {
			return { findUnique: async () => ({ plan: "trial" }) };
		}
		if (key === "contact") {
			return new Proxy(target.contact, {
				get: (inner, name) =>
					name === "count"
						? async () => PLANS.trial.contacts
						: Reflect.get(inner, name),
			});
		}
		return Reflect.get(target, key);
	},
});

const reviveBlockedDb = new Proxy(db, {
	get(target, key) {
		if (key === "contact") {
			return new Proxy(target.contact, {
				get: (inner, name) =>
					name === "updateMany"
						? async () => {
								throw new Prisma.PrismaClientUnknownRequestError(
									`Invalid \`prisma.contact.updateMany()\` invocation: ${CONTACT_LIMIT_MESSAGE}`,
									{ clientVersion: Prisma.prismaVersion.client },
								);
							}
						: Reflect.get(inner, name),
			});
		}
		return Reflect.get(target, key);
	},
});

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const threads = new ThreadWriterService(db, match, stamp, agent);
const limitedMatch = new MailboxMatchService(db, directory, limitedAgent, log);
const limited = new ThreadWriterService(db, limitedMatch, stamp, limitedAgent);
const fullMatch = new MailboxMatchService(fullDb, directory, agent, log);
const full = new ThreadWriterService(db, fullMatch, stamp, agent);
const blockedMatch = new MailboxMatchService(
	reviveBlockedDb,
	directory,
	limitedAgent,
	log,
);
const blocked = new ThreadWriterService(db, blockedMatch, stamp, limitedAgent);

let everyone: MailboxSync;
let nobody: MailboxSync;
let relevant: MailboxSync;

function inbound(person: string, id: string): IncomingMessage {
	return {
		rfcMessageId: id,
		rootId: id,
		subject: "Hello from a stranger",
		from: { email: person, name: "New Person" },
		recipients: [{ email: mailbox, name: "Rep", kind: "to" }],
		body: "We have never spoken before.",
		sentAt: new Date("2026-02-01T10:00:00Z"),
		imapAccountId: null,
	};
}

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: `-${suffix}@mail.test` } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}.test` } },
	});
	await db.company.deleteMany({
		where: {
			domain: { in: [firstDomain, secondDomain, thirdDomain, adoptDomain] },
		},
	});
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Limit Rep", email: mailbox },
	});
	everyone = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:everyone",
			autoCreate: true,
			createWithoutReply: true,
		},
	});
	nobody = await db.mailboxSync.create({
		data: { userId, source: "imap:nobody", autoCreate: false },
	});
	relevant = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:relevant",
			autoCreate: false,
			createFrom: "relevant",
		},
	});
});

afterAll(clean);

describe("the contact limit during a mailbox sync", () => {
	it("stores the mail as a pending thread and does not throw", async () => {
		const first = await limited.store(
			everyone,
			{ origin: "imap", lane: "forward" },
			inbound(`one@${firstDomain}`, `<one-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(first).toBe(true);

		const second = await limited.store(
			everyone,
			{ origin: "imap", lane: "forward" },
			inbound(`two@${firstDomain}`, `<two-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(second).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<two-${suffix}@mail.test>` },
			select: {
				classification: true,
				contactId: true,
				companyId: true,
				messageCount: true,
			},
		});
		expect(thread?.classification).toBe("PENDING");
		expect(thread?.contactId).toBeNull();
		expect(thread?.companyId).toBeNull();
		expect(thread?.messageCount).toBe(1);

		expect(
			await db.contact.findFirst({ where: { email: `two@${firstDomain}` } }),
		).toBeNull();

		const sync = await db.mailboxSync.findUnique({
			where: { id: everyone.id },
			select: { status: true },
		});
		expect(sync?.status).not.toBe("FAILED");
	});

	it("keeps storing mail from a new company while the limit holds", async () => {
		const stored = await limited.store(
			everyone,
			{ origin: "imap", lane: "forward" },
			inbound(`three@${secondDomain}`, `<three-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(stored).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<three-${suffix}@mail.test>` },
			select: { classification: true, contactId: true },
		});
		expect(thread?.classification).toBe("PENDING");
		expect(thread?.contactId).toBeNull();
	});

	it("creates no company when the contact cannot be created", async () => {
		const stored = await full.store(
			everyone,
			{ origin: "imap", lane: "forward" },
			inbound(`four@${thirdDomain}`, `<four-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(stored).toBe(true);

		expect(
			await db.company.findFirst({ where: { domain: thirdDomain } }),
		).toBeNull();

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<four-${suffix}@mail.test>` },
			select: { classification: true, companyId: true },
		});
		expect(thread?.classification).toBe("PENDING");
		expect(thread?.companyId).toBeNull();
	});
});

describe("a contact that writes again", () => {
	it("comes back from the archive on new inbound mail", async () => {
		const email = `back@${firstDomain}`;
		const archived = await db.contact.create({
			data: {
				firstName: "Back",
				email,
				source: "EMAIL",
				archivedAt: new Date("2026-01-01T00:00:00Z"),
			},
			select: { id: true },
		});

		const stored = await threads.store(
			nobody,
			{ origin: "imap", lane: "forward" },
			inbound(email, `<back-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(stored).toBe(true);

		const contact = await db.contact.findUnique({
			where: { id: archived.id },
			select: { archivedAt: true },
		});
		expect(contact?.archivedAt).toBeNull();

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<back-${suffix}@mail.test>` },
			select: { contactId: true },
		});
		expect(thread?.contactId).toBe(archived.id);
	});

	it("stays archived when the rep wrote the mail", async () => {
		const email = `quiet@${firstDomain}`;
		const archived = await db.contact.create({
			data: {
				firstName: "Quiet",
				email,
				source: "EMAIL",
				archivedAt: new Date("2026-01-01T00:00:00Z"),
			},
			select: { id: true },
		});

		await threads.store(
			nobody,
			{ origin: "imap", lane: "forward" },
			{
				...inbound(mailbox, `<quiet-${suffix}@mail.test>`),
				from: { email: mailbox, name: "Rep" },
				recipients: [{ email, name: "Quiet", kind: "to" }],
			},
			await threads.context(),
		);

		const contact = await db.contact.findUnique({
			where: { id: archived.id },
			select: { archivedAt: true },
		});
		expect(contact?.archivedAt).not.toBeNull();
	});

	it("stays archived when the address is our own domain", async () => {
		const email = `colleague@${ownDomain}`;
		const archived = await db.contact.create({
			data: {
				firstName: "Colleague",
				email,
				source: "EMAIL",
				archivedAt: new Date("2026-01-01T00:00:00Z"),
			},
			select: { id: true },
		});

		await threads.store(
			nobody,
			{ origin: "imap", lane: "forward" },
			inbound(email, `<colleague-${suffix}@mail.test>`),
			await threads.context(),
		);

		const contact = await db.contact.findUnique({
			where: { id: archived.id },
			select: { archivedAt: true },
		});
		expect(contact?.archivedAt).not.toBeNull();
	});

	it("stays archived on backfill mail older than the archive", async () => {
		const id = await archivedContact("old", new Date("2026-03-01T00:00:00Z"));

		await threads.store(
			nobody,
			{ origin: "imap", lane: "backfill" },
			inbound(`old@${firstDomain}`, `<old-${suffix}@mail.test>`),
			await threads.context(),
		);

		expect(await archivedAtOf(id)).not.toBeNull();
	});

	it("comes back on backfill mail newer than the archive", async () => {
		const id = await archivedContact("newer", new Date("2026-01-01T00:00:00Z"));

		await threads.store(
			nobody,
			{ origin: "imap", lane: "backfill" },
			inbound(`newer@${firstDomain}`, `<newer-${suffix}@mail.test>`),
			await threads.context(),
		);

		expect(await archivedAtOf(id)).toBeNull();
	});
});

describe("a revive at the contact limit", () => {
	it("keeps the contact archived and still stores the mail", async () => {
		const id = await archivedContact(
			"capped",
			new Date("2026-01-01T00:00:00Z"),
		);

		const stored = await blocked.store(
			everyone,
			{ origin: "imap", lane: "forward" },
			inbound(`capped@${firstDomain}`, `<capped-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(stored).toBe(true);
		expect(await archivedAtOf(id)).not.toBeNull();

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<capped-${suffix}@mail.test>` },
			select: { messageCount: true },
		});
		expect(thread?.messageCount).toBe(1);

		const sync = await db.mailboxSync.findUnique({
			where: { id: everyone.id },
			select: { status: true },
		});
		expect(sync?.status).not.toBe("FAILED");
	});

	it("leaves a pending thread pending on adoption", async () => {
		const root = `<adopt-capped-${suffix}@mail.test>`;
		await threads.store(
			relevant,
			{ origin: "imap", lane: "backfill" },
			inbound(`capped@${adoptDomain}`, root),
			await threads.context(),
		);
		const pending = await db.emailThread.findUniqueOrThrow({
			where: { rootMessageId: root },
			select: { id: true },
		});
		const archived = await db.contact.create({
			data: {
				firstName: "Capped",
				email: `capped@${adoptDomain}`,
				source: "EMAIL",
				archivedAt: new Date("2026-01-01T00:00:00Z"),
			},
			select: { id: true },
		});

		expect(await blocked.adopt(pending.id)).toBe(false);

		const thread = await db.emailThread.findUnique({
			where: { id: pending.id },
			select: { contactId: true, classification: true },
		});
		expect(thread?.contactId).toBeNull();
		expect(thread?.classification).toBe("PENDING");
		expect(await archivedAtOf(archived.id)).not.toBeNull();
	});
});

describe("plan usage", () => {
	it("counts only active contacts", async () => {
		const before = await readCapacityUsage(db);
		await archivedContact("counted", new Date("2026-01-01T00:00:00Z"));
		expect((await readCapacityUsage(db)).contacts).toBe(before.contacts);

		await db.contact.create({
			data: {
				firstName: "Active",
				email: `active@${firstDomain}`,
				source: "EMAIL",
			},
		});
		expect((await readCapacityUsage(db)).contacts).toBe(before.contacts + 1);
	});
});

describe("adopting a pending thread of an archived contact", () => {
	async function pendingThread(name: string) {
		const root = `<adopt-${name}-${suffix}@mail.test>`;
		await threads.store(
			relevant,
			{ origin: "imap", lane: "backfill" },
			inbound(`${name}@${adoptDomain}`, root),
			await threads.context(),
		);
		const thread = await db.emailThread.findUniqueOrThrow({
			where: { rootMessageId: root },
			select: { id: true, contactId: true },
		});
		expect(thread.contactId).toBeNull();
		return thread.id;
	}

	async function archived(name: string, archivedAt: Date) {
		const row = await db.contact.create({
			data: {
				firstName: name,
				email: `${name}@${adoptDomain}`,
				source: "EMAIL",
				archivedAt,
			},
			select: { id: true },
		});
		return row.id;
	}

	it("leaves the thread pending when the mail is older than the archive", async () => {
		const threadId = await pendingThread("stale");
		const id = await archived("stale", new Date("2026-03-01T00:00:00Z"));

		expect(await threads.adopt(threadId)).toBe(false);

		const thread = await db.emailThread.findUnique({
			where: { id: threadId },
			select: { contactId: true, classification: true },
		});
		expect(thread?.contactId).toBeNull();
		expect(thread?.classification).toBe("PENDING");
		expect(await archivedAtOf(id)).not.toBeNull();
	});

	it("revives the contact when the mail is newer than the archive", async () => {
		const threadId = await pendingThread("fresh");
		const id = await archived("fresh", new Date("2026-01-01T00:00:00Z"));

		expect(await threads.adopt(threadId)).toBe(true);

		const thread = await db.emailThread.findUnique({
			where: { id: threadId },
			select: { contactId: true },
		});
		expect(thread?.contactId).toBe(id);
		expect(await archivedAtOf(id)).toBeNull();
	});
});

async function archivedContact(name: string, archivedAt: Date) {
	const row = await db.contact.create({
		data: {
			firstName: name,
			email: `${name}@${firstDomain}`,
			source: "EMAIL",
			archivedAt,
		},
		select: { id: true },
	});
	return row.id;
}

async function archivedAtOf(id: string) {
	const row = await db.contact.findUnique({
		where: { id },
		select: { archivedAt: true },
	});
	return row?.archivedAt ?? null;
}
