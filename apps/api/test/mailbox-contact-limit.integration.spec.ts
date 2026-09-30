import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { CONTACT_LIMIT_MESSAGE } from "@crm/db/plans";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../src/mailbox/thread-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "contact-limit-spec";
const firstDomain = `first-${suffix}.test`;
const secondDomain = `second-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;
const pattern = `%-${suffix}.test`;

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
const threads = new ThreadWriterService(db, match, stamp, agent);

let everyone: MailboxSync;
let nobody: MailboxSync;
let originalFunction: string | null = null;
let hadTrigger = true;
let createdTrigger = false;

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
		where: { domain: { in: [firstDomain, secondDomain] } },
	});
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function limitContactsToOne() {
	await db.$executeRawUnsafe(`
		CREATE OR REPLACE FUNCTION enforce_contact_plan_limit() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN
			IF NEW.email LIKE '${pattern}'
				AND (SELECT count(*) FROM "contact" WHERE email LIKE '${pattern}') >= 1 THEN
				RAISE EXCEPTION '${CONTACT_LIMIT_MESSAGE}' USING ERRCODE = '23514';
			END IF;
			RETURN NEW;
		END;
		$$
	`);

	if (!hadTrigger) {
		await db.$executeRawUnsafe(
			`CREATE TRIGGER contact_plan_limit BEFORE INSERT ON "contact" FOR EACH ROW EXECUTE FUNCTION enforce_contact_plan_limit()`,
		);
		hadTrigger = true;
		createdTrigger = true;
	}
}

beforeAll(async () => {
	const rows = await db.$queryRawUnsafe<{ def: string }[]>(
		`SELECT pg_get_functiondef('enforce_contact_plan_limit'::regproc) AS def`,
	);
	originalFunction = rows[0]?.def ?? null;

	const triggers = await db.$queryRawUnsafe<{ tgname: string }[]>(
		`SELECT tgname FROM pg_trigger WHERE tgrelid = '"contact"'::regclass AND tgname = 'contact_plan_limit'`,
	);
	hadTrigger = triggers.length > 0;

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
});

afterAll(async () => {
	if (createdTrigger) {
		await db.$executeRawUnsafe(
			`DROP TRIGGER IF EXISTS contact_plan_limit ON "contact"`,
		);
	}
	if (originalFunction) await db.$executeRawUnsafe(originalFunction);
	await clean();
});

describe("the contact limit during a mailbox sync", () => {
	it("stores the mail as a pending thread and does not throw", async () => {
		await limitContactsToOne();

		const first = await threads.store(
			everyone,
			{ mailbox, origin: "imap", lane: "forward" },
			inbound(`one@${firstDomain}`, `<one-${suffix}@mail.test>`),
			await threads.context(),
		);
		expect(first).toBe(true);

		const second = await threads.store(
			everyone,
			{ mailbox, origin: "imap", lane: "forward" },
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
		const stored = await threads.store(
			everyone,
			{ mailbox, origin: "imap", lane: "forward" },
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
});

describe("a contact that writes again", () => {
	it("comes back from the archive on new inbound mail", async () => {
		if (originalFunction) await db.$executeRawUnsafe(originalFunction);

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
			{ mailbox, origin: "imap", lane: "forward" },
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
			{ mailbox, origin: "imap", lane: "forward" },
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
});
