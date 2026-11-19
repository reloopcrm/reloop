import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { THREAD_CLASSIFICATION } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import type { AgentTaskOrigin } from "@crm/validation/agent-task-payload";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ReplyAdoptionService } from "../src/mailbox/reply-adoption.service";
import { readReplyAdoptionCursor } from "../src/mailbox/reply-adoption-cursor";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "reply-contacts-spec";
const ownDomain = `own-${suffix}.test`;
const userId = `user-${suffix}`;
const idleUserId = `idle-${suffix}`;
const mailbox = `sales@${ownDomain}`;
const rootEnd = `-${suffix}@mail.test>`;
const DAY = "2026-11-19";
const NOW = new Date(`${DAY}T10:00:00Z`);

const researched: string[] = [];
const reads: { threadId: string; origin: AgentTaskOrigin; reread: boolean }[] =
	[];

const agent = {
	contactCreated: async (contactId: string) => {
		researched.push(contactId);
		return true;
	},
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async (
		threadId: string,
		_reason: string,
		origin: AgentTaskOrigin = "forward",
		options: { reread?: boolean } = {},
	) => {
		reads.push({ threadId, origin, reread: options.reread ?? false });
	},
	contactMemoryRequested: async () => true,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const participants = new ThreadParticipantsService(db, match, stamp, agent);
const threads = new ThreadWriterService(db, match, stamp, agent, participants);
const pass = new ReplyAdoptionService(db, match, threads);

let relevant: MailboxSync;
let replied: MailboxSync;
let nobody: MailboxSync;
let settingsExisted = false;
let cursorBefore: string | null = null;
let counter = 0;

function domainOf(name: string): string {
	return `${name}-${suffix}.test`;
}

function reply(
	sender: string,
	overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
	counter += 1;
	return {
		rfcMessageId: `<reply-${counter}${rootEnd}`,
		rootId: `<campaign-${counter}${rootEnd}`,
		subject: "AW: Überschüssige Europaletten fair abgeben",
		from: { email: sender, name: "Anna Schmidt" },
		recipients: [{ email: mailbox, name: null, kind: "to" }],
		body: "Guten Tag, wir haben 40 Paletten abzugeben. Bitte rufen Sie mich an.",
		sentAt: new Date("2026-05-04T08:30:00Z"),
		imapAccountId: null,
		...overrides,
	};
}

async function store(
	row: MailboxSync,
	message: IncomingMessage,
	lane: AgentTaskOrigin = "forward",
) {
	return threads.store(
		row,
		{ origin: "imap", lane },
		message,
		await threads.context(),
	);
}

function threadOf(message: IncomingMessage) {
	return db.emailThread.findUnique({
		where: { rootMessageId: message.rootId },
		select: {
			id: true,
			classification: true,
			contactId: true,
			companyId: true,
			contact: {
				select: { email: true, lastActivityAt: true, source: true },
			},
			company: { select: { domain: true } },
			activity: { select: { contactId: true, companyId: true } },
		},
	});
}

function contactOf(email: string) {
	return db.contact.findUnique({ where: { email }, select: { id: true } });
}

async function clean() {
	await db.activity.deleteMany({
		where: { createdById: { in: [userId, idleUserId] } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: rootEnd } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}.test` } },
	});
	await db.company.deleteMany({
		where: { domain: { endsWith: `-${suffix}.test` } },
	});
}

async function resetCursor() {
	await db.appSetting.updateMany({
		where: { id: SETTINGS_ID },
		data: { replyAdoptionCursor: null },
	});
}

async function cursor() {
	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { replyAdoptionCursor: true },
	});
	const read = readReplyAdoptionCursor(settings?.replyAdoptionCursor);
	return read.outcome === "ok" ? read.cursor : null;
}

beforeAll(async () => {
	await clean();
	await db.mailboxSync.deleteMany({
		where: { userId: { in: [userId, idleUserId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, idleUserId] } } });

	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { replyAdoptionCursor: true },
	});
	settingsExisted = settings !== null;
	cursorBefore = settings?.replyAdoptionCursor ?? null;

	await db.user.create({
		data: { id: userId, name: "Reply Rep", email: `rep@${ownDomain}` },
	});
	await db.user.create({
		data: { id: idleUserId, name: "Idle Rep", email: `idle@${ownDomain}` },
	});
	relevant = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:relevant",
			autoCreate: false,
			createFrom: "relevant",
		},
	});
	replied = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:replied",
			autoCreate: true,
			createWithoutReply: false,
			createFrom: "replied",
		},
	});
	nobody = await db.mailboxSync.create({
		data: { userId: idleUserId, source: "imap:nobody", autoCreate: false },
	});
});

beforeEach(async () => {
	researched.length = 0;
	reads.length = 0;
	await clean();
	await resetCursor();
	pass.tune({ batch: 100, maxCreatesPerTick: 25, maxContactsPerDay: 500 });
});

afterAll(async () => {
	await clean();
	await db.mailboxSync.deleteMany({
		where: { userId: { in: [userId, idleUserId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, idleUserId] } } });
	if (settingsExisted) {
		await db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { replyAdoptionCursor: cursorBefore },
		});
	} else {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	}
});

describe("a reply to our own mail that the mailbox never held", () => {
	it("becomes a contact with a company under the relevant policy", async () => {
		const sender = `anna.schmidt@${domainOf("brewery")}`;
		const message = reply(sender);

		expect(await store(relevant, message)).toBe(true);

		const thread = await threadOf(message);
		expect(thread?.contact?.email).toBe(sender);
		expect(thread?.contact?.source).toBe("EMAIL");
		expect(thread?.company?.domain).toBe(domainOf("brewery"));
		expect(thread?.classification).toBe(THREAD_CLASSIFICATION.none);
		expect(thread?.activity?.contactId).toBe(thread?.contactId);
		expect(researched).toEqual([thread?.contactId ?? ""]);
	});

	it("reads the English reply prefix too", async () => {
		const sender = `bernd@${domainOf("inks")}`;
		const message = reply(sender, {
			subject: "Re: Sell surplus Euro pallets at fair prices",
		});

		await store(relevant, message);

		expect((await threadOf(message))?.contact?.email).toBe(sender);
	});

	it("creates nobody under the replied policy, which keeps no first mail of a stranger", async () => {
		const sender = `vera@${domainOf("vendor")}`;
		const first = reply(sender, {
			subject: "Mehr Umsatz mit unserer Software",
		});
		first.rootId = first.rfcMessageId;
		const followUp = reply(sender, {
			subject: "Re: Mehr Umsatz mit unserer Software",
			rootId: first.rfcMessageId,
			body: "Haben Sie meine letzte Mail gesehen?",
		});

		expect(await store(replied, first)).toBe(false);
		expect(await store(replied, followUp)).toBe(false);

		expect(await contactOf(sender)).toBeNull();
		expect(await pass.adoptReplies(NOW)).toBe(0);
		expect(await contactOf(sender)).toBeNull();
	});

	it("does not take a stranger's follow-up to their own mail for a reply to ours", async () => {
		const sender = `willi@${domainOf("seller")}`;
		const first = reply(sender, {
			subject: "Mehr Umsatz mit unserer Software",
		});
		first.rootId = first.rfcMessageId;
		const followUp = reply(sender, {
			subject: "Re: Mehr Umsatz mit unserer Software",
			rootId: first.rfcMessageId,
			body: "Haben Sie meine letzte Mail gesehen?",
		});

		expect(await store(relevant, first)).toBe(true);
		expect(await store(relevant, followUp)).toBe(true);
		expect(await pass.adoptReplies(NOW)).toBe(0);

		expect(await contactOf(sender)).toBeNull();
		expect((await threadOf(first))?.contactId).toBeNull();
	});

	it("creates nobody when the mailbox creates nobody", async () => {
		const sender = `carla@${domainOf("quiet")}`;
		const message = reply(sender);

		expect(await store(nobody, message)).toBe(false);
		expect(await contactOf(sender)).toBeNull();
		expect(await threadOf(message)).toBeNull();
	});

	it("files the reply under the sender, not under a larger group in copy", async () => {
		const sender = `dora@${domainOf("frozen")}`;
		const message = reply(sender, {
			recipients: [
				{ email: mailbox, name: null, kind: "to" },
				{ email: `one@${domainOf("agency")}`, name: null, kind: "cc" },
				{ email: `two@${domainOf("agency")}`, name: null, kind: "cc" },
			],
		});

		await store(relevant, message);

		const thread = await threadOf(message);
		expect(thread?.contact?.email).toBe(sender);
		expect(thread?.company?.domain).toBe(domainOf("frozen"));
	});

	it("does not turn an automatic reply into a contact", async () => {
		const sender = `erik@${domainOf("away")}`;
		const message = reply(sender, {
			subject: "Automatische Antwort: Überschüssige Europaletten fair abgeben",
			body: "Ich bin bis zum 12. Mai nicht im Büro.",
		});

		await store(relevant, message);
		await store(
			relevant,
			reply(`frida@${domainOf("away")}`, {
				body: "Danke. Ich bin derzeit im Urlaub und abwesend. In dringenden Fällen wenden Sie sich an die Zentrale.",
			}),
		);

		expect(await contactOf(sender)).toBeNull();
		expect(await contactOf(`frida@${domainOf("away")}`)).toBeNull();
		expect((await threadOf(message))?.classification).toBe(
			THREAD_CLASSIFICATION.pending,
		);
	});

	it("does not turn a bounce into a contact", async () => {
		const human = `greta@${domainOf("bounce")}`;
		const message = reply(human, {
			subject: "AW: Überschüssige Europaletten fair abgeben",
			body: "Ihre Nachricht konnte leider nicht zugestellt werden.",
		});
		const daemon = reply(`mailer-daemon@${domainOf("bounce")}`, {
			subject: "Undeliverable: Überschüssige Europaletten fair abgeben",
			body: "Delivery has failed to these recipients.",
		});

		await store(relevant, message);
		await store(relevant, daemon);

		expect(await contactOf(human)).toBeNull();
		expect(
			await db.company.findFirst({ where: { domain: domainOf("bounce") } }),
		).toBeNull();
	});

	it("does not turn a newsletter or a role sender into a contact", async () => {
		const newsletter = reply(`news.team@${domainOf("letters")}`, {
			subject: "Unsere Angebote im Mai",
		});
		newsletter.rootId = newsletter.rfcMessageId;
		const role = reply(`noreply@${domainOf("letters")}`);

		await store(relevant, newsletter);
		await store(relevant, role);

		expect(await contactOf(`news.team@${domainOf("letters")}`)).toBeNull();
		expect(await contactOf(`noreply@${domainOf("letters")}`)).toBeNull();
	});

	it("does not trust a reply subject that refers to no earlier mail", async () => {
		const sender = `hugo@${domainOf("pretend")}`;
		const message = reply(sender, { subject: "Re: Ihre Rechnung" });
		message.rootId = message.rfcMessageId;

		await store(relevant, message);

		expect(await contactOf(sender)).toBeNull();
	});

	it("does not create from a reply that was written to somebody else", async () => {
		const sender = `ida@${domainOf("list")}`;
		const message = reply(sender, {
			recipients: [
				{ email: `list@${domainOf("forum")}`, name: null, kind: "to" },
			],
		});

		await store(relevant, message);

		expect(await contactOf(sender)).toBeNull();
	});

	it("keeps a reply from the history import for the paced pass", async () => {
		const sender = `jonas@${domainOf("history")}`;
		const message = reply(sender);

		expect(await store(relevant, message, "backfill")).toBe(true);

		const thread = await threadOf(message);
		expect(thread?.classification).toBe(THREAD_CLASSIFICATION.pending);
		expect(thread?.contactId).toBeNull();
		expect(await contactOf(sender)).toBeNull();
	});
});

describe("the paced pass over replies that are already stored", () => {
	async function waiting(sender: string, overrides?: Partial<IncomingMessage>) {
		const message = reply(sender, overrides);
		await store(relevant, message, "backfill");
		return message;
	}

	it("files a waiting reply, dates it at the mail and asks for a new read", async () => {
		const sender = `karl@${domainOf("dairy")}`;
		const message = await waiting(sender);
		const before = await threadOf(message);
		await db.emailThread.update({
			where: { id: before?.id ?? "" },
			data: { classification: THREAD_CLASSIFICATION.irrelevant },
		});
		reads.length = 0;

		expect(await pass.adoptReplies(NOW)).toBe(1);

		const thread = await threadOf(message);
		expect(thread?.contact?.email).toBe(sender);
		expect(thread?.company?.domain).toBe(domainOf("dairy"));
		expect(thread?.activity?.contactId).toBe(thread?.contactId);
		expect(thread?.contact?.lastActivityAt?.toISOString()).toBe(
			message.sentAt.toISOString(),
		);
		expect(reads).toEqual([
			{ threadId: thread?.id ?? "", origin: "backfill", reread: true },
		]);
		expect(researched).toHaveLength(1);
		expect(await cursor()).toMatchObject({ day: DAY, created: 1 });
	});

	it("gives a thread under a known company its sender as contact", async () => {
		const domain = domainOf("known");
		const company = await db.company.create({
			data: { name: "Known", domain, ownerId: userId },
			select: { id: true },
		});
		const sender = `lena@${domain}`;
		const message = await waiting(sender);
		expect((await threadOf(message))?.companyId).toBe(company.id);
		expect((await threadOf(message))?.contactId).toBeNull();

		expect(await pass.adoptReplies(NOW)).toBe(1);

		const thread = await threadOf(message);
		expect(thread?.contact?.email).toBe(sender);
		expect(thread?.companyId).toBe(company.id);
		expect(thread?.activity?.contactId).toBe(thread?.contactId);
	});

	it("leaves automatic replies, bounces and unreferenced mail where they are", async () => {
		const auto = await waiting(`mona@${domainOf("skip")}`, {
			subject: "Automatische Antwort: Überschüssige Europaletten",
			body: "Ich bin bis zum 12. Mai nicht im Büro.",
		});
		const bounce = await waiting(`nils@${domainOf("skip")}`, {
			body: "Ihre Nachricht konnte leider nicht zugestellt werden.",
		});
		const fresh = reply(`olga@${domainOf("skip")}`, {
			subject: "Angebot Stretchfolie",
		});
		fresh.rootId = fresh.rfcMessageId;
		await store(relevant, fresh, "backfill");

		expect(await pass.adoptReplies(NOW)).toBe(0);

		for (const message of [auto, bounce, fresh]) {
			expect((await threadOf(message))?.contactId).toBeNull();
		}
		expect(
			await db.contact.count({
				where: { email: { endsWith: `@${domainOf("skip")}` } },
			}),
		).toBe(0);
		expect(researched).toEqual([]);
	});

	it("stops at the daily number and goes on the next day", async () => {
		pass.tune({ maxContactsPerDay: 2 });
		const messages = [
			await waiting(`p1@${domainOf("pace-a")}`),
			await waiting(`p2@${domainOf("pace-b")}`),
			await waiting(`p3@${domainOf("pace-c")}`),
		];
		const filed = async () => {
			const threads = await Promise.all(messages.map(threadOf));
			return threads.filter((thread) => thread?.contactId).length;
		};

		expect(await pass.adoptReplies(NOW)).toBe(2);
		expect(await pass.adoptReplies(NOW)).toBe(0);
		expect(await filed()).toBe(2);
		expect(await cursor()).toMatchObject({ day: DAY, created: 2 });

		const nextDay = new Date("2026-11-20T00:05:00Z");
		expect(await pass.adoptReplies(nextDay)).toBe(1);
		expect(await filed()).toBe(3);
		expect(await cursor()).toMatchObject({ day: "2026-11-20", created: 1 });
	});

	it("stops at the number for one tick and goes on in the next tick", async () => {
		pass.tune({ maxCreatesPerTick: 1 });
		await waiting(`q1@${domainOf("tick-a")}`);
		await waiting(`q2@${domainOf("tick-b")}`);

		expect(await pass.adoptReplies(NOW)).toBe(1);
		expect(await pass.adoptReplies(NOW)).toBe(1);
		expect(await cursor()).toMatchObject({ day: DAY, created: 2 });
	});

	it("does not count a sender who already is a contact against the day", async () => {
		const sender = `rita@${domainOf("old")}`;
		const company = await db.company.create({
			data: { name: "Old", domain: domainOf("other-old"), ownerId: userId },
			select: { id: true },
		});
		await db.contact.create({
			data: {
				firstName: "Rita",
				email: sender,
				ownerId: userId,
				companyId: company.id,
			},
		});
		const message = reply(sender);
		await db.emailThread.create({
			data: {
				rootMessageId: message.rootId,
				subject: message.subject,
				classification: THREAD_CLASSIFICATION.irrelevant,
				firstMessageAt: message.sentAt,
				lastMessageAt: message.sentAt,
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: message.rfcMessageId,
						syncedByUserId: userId,
						direction: "INBOUND",
						fromEmail: sender,
						fromName: "Rita",
						recipients: message.recipients,
						subject: message.subject,
						body: message.body,
						sentAt: message.sentAt,
					},
				},
			},
		});

		expect(await pass.adoptReplies(NOW)).toBe(0);

		expect((await threadOf(message))?.contact?.email).toBe(sender);
		expect((await cursor())?.created ?? 0).toBe(0);
		expect(researched).toEqual([]);
	});

	it("frees the room it held when the pass fails before it reads", async () => {
		await waiting(`xaver@${domainOf("leak")}`);
		const broken = new ReplyAdoptionService(db, match, {
			context: async () => {
				throw new Error("the identity could not be read");
			},
		} as unknown as ThreadWriterService);

		await expect(broken.adoptReplies(NOW)).rejects.toThrow(
			"the identity could not be read",
		);

		expect((await cursor())?.created).toBe(0);
		expect(await pass.adoptReplies(NOW)).toBe(1);
	});

	it("adds nobody for a mailbox that creates nobody", async () => {
		const sender = `sven@${domainOf("idle")}`;
		const message = reply(sender);
		await db.emailThread.create({
			data: {
				rootMessageId: message.rootId,
				subject: message.subject,
				classification: THREAD_CLASSIFICATION.pending,
				firstMessageAt: message.sentAt,
				lastMessageAt: message.sentAt,
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: message.rfcMessageId,
						syncedByUserId: idleUserId,
						direction: "INBOUND",
						fromEmail: sender,
						recipients: message.recipients,
						subject: message.subject,
						body: message.body,
						sentAt: message.sentAt,
					},
				},
			},
		});

		expect(await pass.adoptReplies(NOW)).toBe(0);
		expect(await contactOf(sender)).toBeNull();
	});

	it("rests after a whole pass and starts again when the rest is over", async () => {
		await waiting(`tom@${domainOf("rest")}`);
		expect(await pass.adoptReplies(NOW)).toBe(1);

		const late = await waiting(`uwe@${domainOf("rest")}`);
		expect(await pass.adoptReplies(new Date(NOW.getTime() + 60_000))).toBe(0);
		expect((await threadOf(late))?.contactId).toBeNull();

		const afterRest = new Date(NOW.getTime() + 31 * 60_000);
		expect(await pass.adoptReplies(afterRest)).toBe(1);
		expect((await threadOf(late))?.contactId).not.toBeNull();
	});
});
