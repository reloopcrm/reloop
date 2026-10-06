import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	db,
	EmailDirection,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { readContactAttention } from "@crm/db/contact-attention";
import {
	listReactivationCandidates,
	readReactivationCandidate,
} from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { ActivitiesService } from "../src/activities/activities.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "thread-participants-spec";
const domain = `kunde-${suffix}.example`;
const ownDomain = `own-${suffix}.example`;
const userId = `user-${suffix}`;
const mailbox = `rep@${ownDomain}`;
const colleague = `colleague@${ownDomain}`;
const roleAddress = `info@${domain}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const participants = new ThreadParticipantsService(db, match, stamp);
const threads = new ThreadWriterService(db, match, stamp, agent, participants);
const activities = new ActivitiesService(db, stamp);

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

let companyId: string;
let row: MailboxSync;
let creating: MailboxSync;
let counter = 0;

function root(name: string): string {
	return `<thread-${name}-${suffix}@mail.example>`;
}

function rfc(): string {
	counter += 1;
	return `<m-${counter}-${suffix}@mail.example>`;
}

function at(day: number, hour = 9): Date {
	return new Date(Date.UTC(2026, 8, day, hour));
}

function inbound(
	from: string,
	rootId: string,
	sentAt: Date,
	overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
	return {
		rfcMessageId: rfc(),
		rootId,
		subject: "Re: Angebot Paletten",
		from: { email: from, name: "Preview Person" },
		recipients: [{ email: mailbox, name: "Rep", kind: "to" }],
		body: "Wir brauchen zwei Paletten.",
		sentAt,
		imapAccountId: null,
		...overrides,
	};
}

function outbound(to: string[], rootId: string, sentAt: Date): IncomingMessage {
	return {
		rfcMessageId: rfc(),
		rootId,
		subject: "Re: Angebot Paletten",
		from: { email: mailbox, name: "Rep" },
		recipients: to.map((email) => ({ email, name: null, kind: "to" })),
		body: "Anbei das Angebot.",
		sentAt,
		imapAccountId: null,
	};
}

async function store(
	message: IncomingMessage,
	mailboxRow: MailboxSync = row,
): Promise<boolean> {
	return threads.store(
		mailboxRow,
		{ origin: "gmail", lane: "forward" },
		message,
		await threads.context(mailbox),
	);
}

async function contact(local: string, options: { archived?: boolean } = {}) {
	return db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			companyId,
			source: "EMAIL",
			archivedAt: options.archived ? at(1) : null,
		},
		select: { id: true },
	});
}

async function threadByRoot(rootId: string) {
	return db.emailThread.findUniqueOrThrow({
		where: { rootMessageId: rootId },
		select: {
			id: true,
			contactId: true,
			participants: {
				orderBy: { firstAt: "asc" },
				select: { contactId: true, role: true, firstAt: true, lastAt: true },
			},
			activity: { select: { id: true, contactId: true } },
		},
	});
}

async function linksOf(contactId: string) {
	return db.emailThreadContact.findMany({
		where: { contactId },
		select: { threadId: true, role: true },
	});
}

async function emailTimeline(contactId: string) {
	const result = await activities.timeline(
		{ contactId, filter: "email", limit: 20 },
		userId,
	);
	return result.entries.map((entry) => entry.emailThread?.id ?? null);
}

async function markRelevant(threadId: string, lastMessageAt: Date) {
	await db.threadInsight.create({
		data: {
			threadId,
			relevant: true,
			topics: ["Paletten"],
			products: ["Europalette"],
			outcome: "OPEN_INQUIRY_THEIRS",
			unansweredByUs: true,
			summary: "Sie fragen nach Paletten.",
			evidence: ["Wir brauchen zwei Paletten."],
			modelId: "test",
			lastMessageAt,
		},
	});
}

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `-${suffix}@mail.example>` } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}.example` } },
	});
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Preview Rep", email: mailbox },
	});
	row = await db.mailboxSync.create({
		data: { userId, source: "gmail", autoCreate: false },
	});
	creating = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:creating",
			autoCreate: true,
			createWithoutReply: true,
		},
	});
	const company = await db.company.create({
		data: { name: "Kunde", domain, source: "EMAIL" },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(clean);

describe("every person in a conversation is linked to it", () => {
	it("links two senders of one thread and keeps the slot on the first", async () => {
		const anna = await contact("anna");
		const bert = await contact("bert");
		const rootId = root("two-senders");

		expect(await store(inbound(`anna@${domain}`, rootId, at(2)))).toBe(true);
		expect(await store(inbound(`bert@${domain}`, rootId, at(3)))).toBe(true);

		const thread = await threadByRoot(rootId);
		expect(thread.contactId).toBe(anna.id);
		expect(thread.participants).toEqual([
			{ contactId: anna.id, role: "SENDER", firstAt: at(2), lastAt: at(2) },
			{ contactId: bert.id, role: "SENDER", firstAt: at(3), lastAt: at(3) },
		]);

		expect(await emailTimeline(anna.id)).toEqual([thread.id]);
		expect(await emailTimeline(bert.id)).toEqual([thread.id]);
		expect(
			await activities.timelineCounts({ contactId: bert.id }),
		).toMatchObject({ email: 1, all: 1 });

		const stamped = await db.contact.findUniqueOrThrow({
			where: { id: bert.id },
			select: { threadMailAt: true, lastActivityAt: true },
		});
		expect(stamped.threadMailAt).toEqual(at(3));
		expect(stamped.lastActivityAt).toEqual(at(3));
	});

	it("shows the non-owner their newest read thread and the whole exchange", async () => {
		const bert = await db.contact.findFirstOrThrow({
			where: { email: `bert@${domain}` },
			select: { id: true },
		});
		const thread = await threadByRoot(root("two-senders"));
		await markRelevant(thread.id, at(3));

		const candidate = await readReactivationCandidate(db, {
			contactId: bert.id,
			rules,
			now: at(30),
		});
		expect(candidate?.threads).toBe(1);
		expect(candidate?.messagesFromThem).toBe(2);
		expect(candidate?.lastSubject).toBe("Re: Angebot Paletten");

		const attention = await readContactAttention(db, {
			contactId: bert.id,
			rules,
			now: at(30),
		});
		expect(attention.kind).toBe("owed");
		expect(attention.fields).toContainEqual(
			expect.objectContaining({
				key: "outcome",
				outcome: "OPEN_INQUIRY_THEIRS",
				source: expect.objectContaining({ threadId: thread.id }),
			}),
		);
	});

	it("keeps one person per conversation on the win back list", async () => {
		const report = await listReactivationCandidates(db, {
			rules,
			now: at(30),
			limit: 1000,
		});
		const ours = report.candidates
			.filter((candidate) => candidate.contact.email?.endsWith(`@${domain}`))
			.map((candidate) => candidate.contact.email);

		expect(ours).toEqual([`anna@${domain}`]);
	});

	it("links an outbound recipient and turns them into a sender when they reply", async () => {
		const carl = await contact("carl");
		const rootId = root("recipient");

		expect(await store(outbound([`carl@${domain}`], rootId, at(4)))).toBe(true);
		expect((await threadByRoot(rootId)).participants).toEqual([
			{ contactId: carl.id, role: "RECIPIENT", firstAt: at(4), lastAt: at(4) },
		]);

		expect(await store(inbound(`carl@${domain}`, rootId, at(5)))).toBe(true);
		expect((await threadByRoot(rootId)).participants).toEqual([
			{ contactId: carl.id, role: "SENDER", firstAt: at(4), lastAt: at(5) },
		]);
	});

	it("never links our own people, role addresses or automated senders", async () => {
		const own = await db.contact.create({
			data: { firstName: "Colleague", email: colleague, source: "MANUAL" },
			select: { id: true },
		});
		const role = await db.contact.create({
			data: { firstName: "Info", email: roleAddress, companyId },
			select: { id: true },
		});
		const rootId = root("recipient");

		expect(
			await store(
				outbound([`carl@${domain}`, colleague, roleAddress], rootId, at(6)),
			),
		).toBe(true);
		expect(
			await store(
				inbound(`noreply@${domain}`, rootId, at(7), {
					subject: "Automatische Antwort: Angebot Paletten",
				}),
			),
		).toBe(true);

		const thread = await threadByRoot(rootId);
		expect(thread.participants.map((link) => link.contactId)).toEqual([
			(
				await db.contact.findFirstOrThrow({
					where: { email: `carl@${domain}` },
					select: { id: true },
				})
			).id,
		]);
		expect(await linksOf(own.id)).toEqual([]);
		expect(await linksOf(role.id)).toEqual([]);
	});

	it("fills an empty slot with a known participant and backfills a contact created later", async () => {
		const rootId = root("later");
		expect(await store(inbound(`dora@${domain}`, rootId, at(8)))).toBe(true);
		expect(await store(outbound([`dora@${domain}`], rootId, at(9)))).toBe(true);

		const before = await threadByRoot(rootId);
		expect(before.contactId).toBeNull();
		expect(before.activity?.contactId).toBeNull();
		expect(before.participants).toEqual([]);

		const dora = await contact("dora");
		expect(
			await participants.linkContact(
				dora.id,
				`dora@${domain}`,
				await threads.context(mailbox),
			),
		).toBe(1);

		const after = await threadByRoot(rootId);
		expect(after.contactId).toBe(dora.id);
		expect(after.activity?.contactId).toBe(dora.id);
		expect(after.participants).toEqual([
			{ contactId: dora.id, role: "SENDER", firstAt: at(8), lastAt: at(9) },
		]);
		expect(await emailTimeline(dora.id)).toEqual([after.id]);
	});

	it("links the older threads of a contact the sync creates", async () => {
		const frank = await contact("frank");
		const older = root("older");
		expect(
			await store(
				outbound([`frank@${domain}`, `gina@${domain}`], older, at(12)),
			),
		).toBe(true);
		expect((await threadByRoot(older)).contactId).toBe(frank.id);

		const newer = root("newer");
		expect(
			await store(inbound(`gina@${domain}`, newer, at(13)), creating),
		).toBe(true);

		const gina = await db.contact.findFirstOrThrow({
			where: { email: `gina@${domain}` },
			select: { id: true },
		});
		expect((await threadByRoot(newer)).contactId).toBe(gina.id);
		expect(
			(await linksOf(gina.id)).sort((a, b) => a.role.localeCompare(b.role)),
		).toEqual([
			{ threadId: (await threadByRoot(older)).id, role: "RECIPIENT" },
			{ threadId: (await threadByRoot(newer)).id, role: "SENDER" },
		]);
	});

	it("links a thread filed under a company to the known sender who wrote into it", async () => {
		const erik = await contact("erik");
		const rootId = root("known-slot");
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: rootId,
				subject: "Angebot Paletten",
				companyId,
				firstMessageAt: at(10),
				lastMessageAt: at(10),
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: rfc(),
						syncedByUserId: userId,
						direction: EmailDirection.INBOUND,
						fromEmail: `erik@${domain}`,
						recipients: [{ email: mailbox, name: "Rep" }],
						subject: "Angebot Paletten",
						sentAt: at(10),
					},
				},
				activity: {
					create: {
						type: ActivityType.EMAIL,
						subject: "Angebot Paletten",
						occurredAt: at(10),
						companyId,
						createdById: userId,
					},
				},
			},
			select: { id: true },
		});

		await participants.settle(
			await participants.linkThread(thread.id, await threads.context(mailbox)),
		);

		const linked = await threadByRoot(rootId);
		expect(linked.contactId).toBe(erik.id);
		expect(linked.activity?.contactId).toBe(erik.id);
		expect(linked.participants).toEqual([
			{ contactId: erik.id, role: "SENDER", firstAt: at(10), lastAt: at(10) },
		]);
	});

	it("keeps the table consistent when a contact is archived, renamed or deleted", async () => {
		const carl = await db.contact.findFirstOrThrow({
			where: { email: `carl@${domain}` },
			select: { id: true },
		});
		const context = await threads.context(mailbox);

		await db.contact.update({
			where: { id: carl.id },
			data: { archivedAt: at(11) },
		});
		const plans = await participants.plan(
			[(await threadByRoot(root("recipient"))).id],
			context,
		);
		expect(plans[0]?.rows.map((link) => link.archived)).toEqual([true]);
		expect(await participants.apply(plans)).toMatchObject({ stamps: [] });
		expect(await linksOf(carl.id)).toHaveLength(1);

		expect(
			await participants.relinkContact(carl.id, `carl.neu@${domain}`, context),
		).toBe(0);
		expect(await linksOf(carl.id)).toEqual([]);

		expect(
			await participants.relinkContact(carl.id, `carl@${domain}`, context),
		).toBe(1);
		expect(await linksOf(carl.id)).toHaveLength(1);

		await db.contact.delete({ where: { id: carl.id } });
		expect(
			await db.emailThreadContact.count({ where: { contactId: carl.id } }),
		).toBe(0);
	});

	it("backfills idempotently, resumes from a thread id and writes nothing on a dry run", async () => {
		const where = {
			thread: { rootMessageId: { endsWith: `-${suffix}@mail.example>` } },
		};
		const before = await db.emailThreadContact.count({ where });
		expect(before).toBeGreaterThan(0);
		await db.emailThreadContact.deleteMany({ where });

		const dry = await participants.backfill({ from: null, dryRun: true });
		expect(dry.done).toBe(true);
		expect(dry.written).toBeGreaterThanOrEqual(before);
		expect(await db.emailThreadContact.count({ where })).toBe(0);

		const stopped = await participants.backfill({
			from: null,
			dryRun: false,
			batch: 1,
			deadlineAt: Date.now(),
		});
		expect(stopped.done).toBe(false);
		expect(stopped.lastId).not.toBeNull();

		const rest = await participants.backfill({
			from: stopped.lastId,
			dryRun: false,
		});
		expect(rest.done).toBe(true);
		expect(await db.emailThreadContact.count({ where })).toBe(before);

		const again = await participants.backfill({ from: null, dryRun: false });
		expect(again.written).toBe(0);
		expect(again.removed).toBe(0);
		expect(await db.emailThreadContact.count({ where })).toBe(before);
	});
});
