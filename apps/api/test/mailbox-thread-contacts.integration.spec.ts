import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { PLANS } from "@crm/db/plans";
import { SETTINGS_ID } from "@crm/db/settings";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadContactsService } from "../src/mailbox/thread-contacts.service";
import { readThreadContactsCursor } from "../src/mailbox/thread-contacts-cursor";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "thread-contacts-spec";
const domain = `kunde-${suffix}.example`;
const otherDomain = `andere-${suffix}.example`;
const ownDomain = `own-${suffix}.example`;
const userId = `user-${suffix}`;
const quietUserId = `quiet-${suffix}`;
const mailbox = `rep@${ownDomain}`;
const quietMailbox = `quiet@${ownDomain}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
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

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const threads = new ThreadWriterService(db, match, stamp, agent);
const pass = new ThreadContactsService(db, match, threads, stamp).tune({
	settleMs: 0,
	batch: 1_000,
});
const fullMatch = new MailboxMatchService(fullDb, directory, agent, log);
const fullPass = new ThreadContactsService(db, fullMatch, threads, stamp).tune({
	settleMs: 0,
	batch: 1_000,
});

let companyId: string;
let relevantBox: MailboxSync;
let counter = 0;

function rfc(name: string): string {
	counter += 1;
	return `<${name}-${counter}-${suffix}@mail.example>`;
}

function inbound(
	from: string,
	root: string,
	overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
	return {
		rfcMessageId: overrides.rfcMessageId ?? root,
		rootId: root,
		subject: "Re: Angebot Paletten",
		from: { email: from, name: "Preview Person" },
		recipients: [{ email: mailbox, name: "Rep", kind: "to" }],
		body: "Wir brauchen zwei Paletten.",
		sentAt: new Date("2026-09-17T10:00:00Z"),
		imapAccountId: null,
		...overrides,
	};
}

async function contactA(name: string) {
	return db.contact.create({
		data: {
			firstName: name,
			email: `${name}@${domain}`,
			companyId,
			source: "EMAIL",
		},
		select: { id: true },
	});
}

async function relevantThread(options: {
	contactId: string | null;
	messages: { from: string; subject?: string; syncedBy?: string }[];
	relevant?: boolean;
}) {
	counter += 1;
	const root = `<thread-${counter}-${suffix}@mail.example>`;
	const sentAt = new Date("2026-09-17T10:00:00Z");
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: root,
			subject: "Angebot Paletten",
			companyId,
			contactId: options.contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messageCount: options.messages.length,
			messages: {
				create: options.messages.map((message, index) => ({
					rfcMessageId: `<m-${counter}-${index}-${suffix}@mail.example>`,
					syncedByUserId: message.syncedBy ?? userId,
					direction: "INBOUND",
					fromEmail: message.from,
					fromName: "Preview Person",
					recipients: [{ email: mailbox, name: "Rep" }],
					subject: message.subject ?? "Re: Angebot Paletten",
					body: "Wir brauchen zwei Paletten.",
					sentAt,
				})),
			},
		},
		select: { id: true },
	});
	if (options.relevant !== false) await markRelevant(thread.id);
	return thread.id;
}

async function markRelevant(threadId: string) {
	await db.threadInsight.create({
		data: {
			threadId,
			relevant: true,
			topics: [],
			products: [],
			outcome: "OTHER",
			summary: "",
			evidence: [],
			modelId: "test",
			lastMessageAt: new Date("2026-09-17T10:00:00Z"),
		},
	});
}

async function contactOf(email: string) {
	return db.contact.findFirst({
		where: { email },
		select: { id: true, companyId: true, ownerId: true },
	});
}

async function cursor() {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { threadContactsCursor: true },
	});
	return row?.threadContactsCursor ?? null;
}

async function clean() {
	await db.activity.deleteMany({
		where: { createdById: { in: [userId, quietUserId] } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `-${suffix}@mail.example>` } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}.example` } },
	});
	await db.suppressedContact.deleteMany({
		where: { email: { endsWith: `-${suffix}.example` } },
	});
	await db.company.deleteMany({
		where: { domain: { in: [domain, otherDomain] } },
	});
	await db.mailboxSync.deleteMany({
		where: { userId: { in: [userId, quietUserId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, quietUserId] } } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Preview Rep", email: mailbox },
	});
	await db.user.create({
		data: { id: quietUserId, name: "Quiet Rep", email: quietMailbox },
	});
	relevantBox = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:relevant",
			autoCreate: false,
			createFrom: "relevant",
		},
	});
	await db.mailboxSync.create({
		data: { userId: quietUserId, source: "imap:nobody", autoCreate: false },
	});
	await db.mailboxSync.create({
		data: { userId: quietUserId, source: "calendar", autoCreate: true },
	});
	const company = await db.company.create({
		data: { name: "Kunde", domain, source: "EMAIL" },
		select: { id: true },
	});
	companyId = company.id;
	await pass.addFromRelevantThreads();
});

afterAll(clean);

describe("senders of a relevant thread", () => {
	it("adds a second sender of the company and keeps the thread contact", async () => {
		const a = await contactA("anna");
		const threadId = await relevantThread({
			contactId: a.id,
			messages: [{ from: `anna@${domain}` }, { from: `bert@${domain}` }],
		});

		expect(await pass.addFromRelevantThreads()).toBe(1);

		const bert = await contactOf(`bert@${domain}`);
		expect(bert?.companyId).toBe(companyId);
		expect(bert?.ownerId).toBe(userId);

		const thread = await db.emailThread.findUnique({
			where: { id: threadId },
			select: { contactId: true },
		});
		expect(thread?.contactId).toBe(a.id);
	});

	it("leaves out another domain, an auto reply, own and role addresses", async () => {
		const a = await contactA("carla");
		await relevantThread({
			contactId: a.id,
			messages: [
				{ from: `dora@${otherDomain}` },
				{ from: `emil@${domain}`, subject: "Automatische Antwort: Angebot" },
				{ from: `colleague@${ownDomain}` },
				{ from: mailbox },
				{ from: `info@${domain}` },
				{ from: `noreply@${domain}` },
			],
		});

		expect(await pass.addFromRelevantThreads()).toBe(0);

		for (const email of [
			`dora@${otherDomain}`,
			`emil@${domain}`,
			`colleague@${ownDomain}`,
			`info@${domain}`,
			`noreply@${domain}`,
		]) {
			expect(await contactOf(email)).toBeNull();
		}
	});

	it("leaves out a suppressed address", async () => {
		await db.suppressedContact.create({
			data: { email: `frida@${domain}`, reason: "test" },
		});
		const a = await contactA("gustav");
		await relevantThread({
			contactId: a.id,
			messages: [{ from: `frida@${domain}` }],
		});

		expect(await pass.addFromRelevantThreads()).toBe(0);
		expect(await contactOf(`frida@${domain}`)).toBeNull();
	});

	it("leaves out a sender whose mailbox creates nobody", async () => {
		const a = await contactA("hanna");
		await relevantThread({
			contactId: a.id,
			messages: [{ from: `ida@${domain}`, syncedBy: quietUserId }],
		});

		expect(await pass.addFromRelevantThreads()).toBe(0);
		expect(await contactOf(`ida@${domain}`)).toBeNull();
	});

	it("skips at the contact limit without an error and keeps the cursor", async () => {
		const a = await contactA("jan");
		await relevantThread({
			contactId: a.id,
			messages: [{ from: `karl@${domain}` }],
		});
		const before = await cursor();

		expect(await fullPass.addFromRelevantThreads()).toBe(0);
		expect(await contactOf(`karl@${domain}`)).toBeNull();
		expect(await cursor()).toBe(before);

		expect(await pass.addFromRelevantThreads()).toBe(1);
		expect(await contactOf(`karl@${domain}`)).not.toBeNull();
	});

	it("gives a relevant-only mailbox a contact once the thread is relevant", async () => {
		const root = rfc("relevant-only");
		await threads.store(
			relevantBox,
			{ origin: "imap", lane: "forward" },
			inbound(`lena@${domain}`, root),
			await threads.context(),
		);
		const stored = await db.emailThread.findUniqueOrThrow({
			where: { rootMessageId: root },
			select: { id: true, companyId: true, contactId: true },
		});
		expect(stored.companyId).toBe(companyId);
		expect(stored.contactId).toBeNull();

		expect(await pass.addFromRelevantThreads()).toBe(0);
		expect(await contactOf(`lena@${domain}`)).toBeNull();

		await markRelevant(stored.id);
		expect(await pass.addFromRelevantThreads()).toBe(1);

		const lena = await contactOf(`lena@${domain}`);
		expect(lena?.companyId).toBe(companyId);

		const thread = await db.emailThread.findUnique({
			where: { id: stored.id },
			select: { contactId: true, activity: { select: { contactId: true } } },
		});
		expect(thread?.contactId).toBe(lena?.id ?? "missing");
		expect(thread?.activity?.contactId).toBe(lena?.id ?? "missing");
	});

	it("resumes at the cursor and sees new mail in a thread it passed", async () => {
		await pass.addFromRelevantThreads();
		const a = await contactA("mia");
		const first = await relevantThread({
			contactId: a.id,
			messages: [{ from: `nils@${domain}` }],
		});
		const second = await relevantThread({
			contactId: a.id,
			messages: [{ from: `olga@${domain}` }],
		});
		const small = new ThreadContactsService(db, match, threads, stamp).tune({
			settleMs: 0,
			batch: 1,
		});

		expect(await small.addFromRelevantThreads()).toBe(1);
		expect(await contactOf(`nils@${domain}`)).not.toBeNull();
		expect(await contactOf(`olga@${domain}`)).toBeNull();
		const read = readThreadContactsCursor(await cursor());
		expect(read.outcome === "ok" ? read.cursor.id : null).toBe(first);

		expect(await small.addFromRelevantThreads()).toBe(1);
		expect(await contactOf(`olga@${domain}`)).not.toBeNull();
		const next = readThreadContactsCursor(await cursor());
		expect(next.outcome === "ok" ? next.cursor.id : null).toBe(second);

		const root = await db.emailThread.findUniqueOrThrow({
			where: { id: first },
			select: { rootMessageId: true },
		});
		await threads.store(
			relevantBox,
			{ origin: "imap", lane: "forward" },
			inbound(`paul@${domain}`, root.rootMessageId, {
				rfcMessageId: rfc("forward"),
				sentAt: new Date("2026-09-18T10:00:00Z"),
			}),
			await threads.context(),
		);

		expect(await pass.addFromRelevantThreads()).toBe(1);
		expect(await contactOf(`paul@${domain}`)).not.toBeNull();
	});

	it("counts in a dry run and writes nothing", async () => {
		const a = await contactA("quirin");
		await relevantThread({
			contactId: a.id,
			messages: [{ from: `rosa@${domain}` }, { from: `sven@${otherDomain}` }],
		});
		const before = await cursor();
		const contacts = await db.contact.count();

		const preview = await pass.preview();

		expect(preview.senders.create).toBeGreaterThanOrEqual(1);
		expect(preview.createByDomain[domain]).toBeGreaterThanOrEqual(1);
		expect(preview.senders["other-domain"]).toBeGreaterThanOrEqual(1);
		expect(preview.senders.known).toBeGreaterThanOrEqual(1);
		expect(await db.contact.count()).toBe(contacts);
		expect(await contactOf(`rosa@${domain}`)).toBeNull();
		expect(await cursor()).toBe(before);
	});
});
