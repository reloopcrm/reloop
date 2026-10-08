import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	db,
	EmailDirection,
	type MailboxSyncModel as MailboxSync,
	RecordSource,
} from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { DirectionRepairService } from "../src/mailbox/direction-repair.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { isOwnAddress } from "../src/mailbox/participants";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "own-addresses-spec";
const customerDomain = `kunde-${suffix}.test`;
const customer = `einkauf@${customerDomain}`;
const userA = `user-a-${suffix}`;
const userB = `user-b-${suffix}`;
const loginA = `anna-${suffix}@example.com`;
const loginB = `ben-${suffix}@example.com`;
const mailboxA = `anna@team-${suffix}.test`;
const mailboxB = `ben@team-${suffix}.test`;
const alias = `verkauf@alias-${suffix}.test`;
const root = (name: string) => `<${name}-${suffix}@mail.test>`;

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

let rowA: MailboxSync;
let rowB: MailboxSync;
let savedAliases: string[] | null = null;

function mail(
	name: string,
	from: string,
	to: string,
	sentAt = "2026-03-01T10:00:00Z",
): IncomingMessage {
	return {
		rfcMessageId: root(name),
		rootId: root(name),
		subject: "Angebot",
		from: { email: from, name: null },
		recipients: [{ email: to, name: null, kind: "to" }],
		body: "Hier ist das Angebot.",
		sentAt: new Date(sentAt),
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function directionOf(name: string) {
	const message = await db.emailMessage.findUnique({
		where: { rfcMessageId: root(name) },
		select: { direction: true },
	});
	return message?.direction;
}

async function realAnswerOf(name: string) {
	const message = await db.emailMessage.findUnique({
		where: { rfcMessageId: root(name) },
		select: { realAnswer: true },
	});
	return message?.realAnswer;
}

async function clean() {
	await db.activity.deleteMany({
		where: { createdById: { in: [userA, userB] } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { contains: `-${suffix}@mail.test` } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `-${suffix}.test` } },
	});
	await db.company.deleteMany({ where: { domain: customerDomain } });
	await db.mailboxSync.deleteMany({
		where: { userId: { in: [userA, userB] } },
	});
	await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({ data: { id: userA, name: "Anna", email: loginA } });
	await db.user.create({ data: { id: userB, name: "Ben", email: loginB } });
	rowA = await db.mailboxSync.create({
		data: { userId: userA, source: "gmail", autoCreate: false },
	});
	rowB = await db.mailboxSync.create({
		data: { userId: userB, source: "outlook", autoCreate: false },
	});

	const company = await db.company.create({
		data: { name: "Kunde", domain: customerDomain },
		select: { id: true },
	});
	await db.contact.create({
		data: {
			firstName: "Einkauf",
			lastName: null,
			email: customer,
			companyId: company.id,
		},
	});

	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { ownAddresses: true },
	});
	savedAliases = settings?.ownAddresses ?? null;
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ownAddresses: [alias.toUpperCase()] },
		update: { ownAddresses: [...(savedAliases ?? []), alias.toUpperCase()] },
	});
});

afterAll(async () => {
	await clean();
	if (savedAliases === null) {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	} else {
		await db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { ownAddresses: savedAliases },
		});
	}
});

describe("the workspace's own addresses", () => {
	it("records each mailbox address once", async () => {
		const state = new SyncStateService(db);
		await state.recordAddress(rowA, mailboxA);
		await state.recordAddress(rowB, mailboxB);
		rowA = await db.mailboxSync.findUniqueOrThrow({ where: { id: rowA.id } });
		rowB = await db.mailboxSync.findUniqueOrThrow({ where: { id: rowB.id } });

		const own = await match.internalIdentity();

		expect(rowA.address).toBe(mailboxA);
		expect(own.addresses.has(mailboxA)).toBe(true);
		expect(own.addresses.has(mailboxB)).toBe(true);
		expect(own.addresses.has(alias)).toBe(true);
	});

	it("files a colleague's mail as ours when another mailbox reads it", async () => {
		await threads.store(
			rowA,
			{ origin: "gmail", lane: "forward" },
			mail("colleague", mailboxB, customer),
			await threads.context(mailboxA),
		);

		expect(await directionOf("colleague")).toBe(EmailDirection.OUTBOUND);
	});

	it("files mail from a confirmed alias as ours", async () => {
		await threads.store(
			rowA,
			{ origin: "gmail", lane: "forward" },
			mail("alias", alias, customer),
			await threads.context(mailboxA),
		);

		expect(await directionOf("alias")).toBe(EmailDirection.OUTBOUND);
	});

	it("keeps the customer's mail inbound", async () => {
		await threads.store(
			rowA,
			{ origin: "gmail", lane: "forward" },
			mail("customer", customer, mailboxA),
			await threads.context(mailboxA),
		);

		expect(await directionOf("customer")).toBe(EmailDirection.INBOUND);
	});

	it("gives the same direction whichever mailbox reads a message first", async () => {
		for (const [name, first, second] of [
			["b-first", rowB, rowA],
			["a-first", rowA, rowB],
		] as const) {
			const message = mail(name, mailboxA, customer);
			const readers = [first, second];
			for (const reader of readers) {
				await threads.store(
					reader,
					{ origin: "gmail", lane: "forward" },
					message,
					await threads.context(reader === rowA ? mailboxA : mailboxB),
				);
			}

			expect(await directionOf(name)).toBe(EmailDirection.OUTBOUND);
		}
	});
});

describe("repairing mail stored with the wrong direction", () => {
	it("flips mail from an own address once and leaves the rest", async () => {
		await threads.store(
			rowA,
			{ origin: "gmail", lane: "forward" },
			mail("wrong", mailboxB, customer, "2026-03-02T10:00:00Z"),
			await threads.context(mailboxA),
		);
		await db.emailMessage.update({
			where: { rfcMessageId: root("wrong") },
			data: { direction: EmailDirection.INBOUND, realAnswer: true },
		});

		const wrong = await db.emailMessage.findUniqueOrThrow({
			where: { rfcMessageId: root("wrong") },
			select: { threadId: true, thread: { select: { lastMessageAt: true } } },
		});
		await db.threadInsight.create({
			data: {
				threadId: wrong.threadId,
				relevant: true,
				topics: [],
				products: [],
				outcome: "OPEN",
				unansweredByUs: true,
				summary: "Waiting for our answer",
				evidence: [],
				modelId: "test",
				lastMessageAt: wrong.thread.lastMessageAt,
			},
		});

		const scoped = {
			internalIdentity: async () => ({
				addresses: new Set([mailboxB]),
				domains: new Set<string>(),
			}),
			suppressedDomains: async () => new Set<string>(),
			suppressedEmails: async () => new Set<string>(),
		} as unknown as MailboxMatchService;
		const requested: unknown[][] = [];
		const trigger = {
			threadStored: async (...args: unknown[]) => {
				requested.push(args);
			},
			contactMemoryRequested: async () => true,
		} as unknown as AgentTriggerService;

		expect(
			await new DirectionRepairService(
				db,
				scoped,
				trigger,
				new ThreadParticipantsService(db, scoped, stamp, trigger),
			).repair(),
		).toBe(1);
		expect(await directionOf("wrong")).toBe(EmailDirection.OUTBOUND);
		expect(await realAnswerOf("wrong")).toBe(false);
		expect(await directionOf("customer")).toBe(EmailDirection.INBOUND);
		expect(await realAnswerOf("customer")).toBe(true);
		expect(requested).toEqual([
			[
				wrong.threadId,
				"Mail from our own address was filed as received",
				"backfill",
				{ reread: true },
			],
		]);

		expect(
			await new DirectionRepairService(
				db,
				scoped,
				trigger,
				new ThreadParticipantsService(db, scoped, stamp, trigger),
			).repair(),
		).toBe(0);
		expect(await directionOf("wrong")).toBe(EmailDirection.OUTBOUND);
		expect(requested).toHaveLength(1);
	});
});

describe("own identity rules", () => {
	it("never treats a freemail domain as our own", async () => {
		const before = process.env.ALLOWED_SIGN_IN;
		process.env.ALLOWED_SIGN_IN = "example.com,gmail.com,outlook.at,mynet.com";
		try {
			const own = await match.internalIdentity();
			expect(own.domains.has("gmail.com")).toBe(false);
			expect(own.domains.has("outlook.at")).toBe(false);
			expect(own.domains.has("mynet.com")).toBe(false);
			expect(own.domains.has("example.com")).toBe(true);
		} finally {
			process.env.ALLOWED_SIGN_IN = before;
		}

		expect(
			isOwnAddress("kunde@gmail.com", {
				ourAddresses: new Set(),
				ourDomains: new Set(["gmail.com"]),
			}),
		).toBe(false);
	});
});

describe("a contact that already exists", () => {
	it("keeps its name when a mailbox sender line is a department", async () => {
		const company = await db.company.findFirstOrThrow({
			where: { domain: customerDomain },
			select: { id: true },
		});
		const email = `m.beispiel@${customerDomain}`;
		const contact = await db.contact.create({
			data: {
				firstName: "M",
				lastName: "Beispiel",
				email,
				companyId: company.id,
			},
			select: { id: true },
		});
		const person = { email, name: "Buchhaltung Beispiel AG" };

		await match["createContact"]([person], customerDomain, company.id, {
			participants: [person],
			allowCreate: true,
			source: RecordSource.EMAIL,
			ownerId: userA,
		});
		await threads["contactWithoutCompany"](
			person,
			userA,
			await threads.context(),
		);

		expect(
			await db.contact.findUniqueOrThrow({
				where: { id: contact.id },
				select: { firstName: true, lastName: true },
			}),
		).toEqual({ firstName: "M", lastName: "Beispiel" });
	});
});
