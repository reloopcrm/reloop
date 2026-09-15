import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
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

const suffix = process.env.TEST_RUN_ID ?? "create-policy-spec";
const domain = `policy-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;

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

let repliedOnly: MailboxSync;
let everyone: MailboxSync;

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
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Policy Rep", email: mailbox },
	});
	repliedOnly = await db.mailboxSync.create({
		data: { userId, source: "imap:replied", autoCreate: true },
	});
	everyone = await db.mailboxSync.create({
		data: {
			userId,
			source: "imap:everyone",
			autoCreate: true,
			createWithoutReply: true,
		},
	});
});

afterAll(clean);

describe("who becomes a contact from an inbound email", () => {
	it("skips a stranger when the mailbox only creates people the rep replied to", async () => {
		const person = `first@${domain}`;
		const stored = await threads.store(
			repliedOnly,
			{ mailbox, origin: "imap" },
			inbound(person, `<replied-${suffix}@mail.test>`),
			await threads.context(),
		);

		expect(stored).toBe(false);
		expect(await db.contact.findFirst({ where: { email: person } })).toBeNull();
	});

	it("creates the stranger when the mailbox creates from everyone", async () => {
		const person = `second@${domain}`;
		const stored = await threads.store(
			everyone,
			{ mailbox, origin: "imap" },
			inbound(person, `<everyone-${suffix}@mail.test>`),
			await threads.context(),
		);

		expect(stored).toBe(true);

		const contact = await db.contact.findFirst({
			where: { email: person },
			select: { id: true, company: { select: { domain: true } } },
		});
		expect(contact).not.toBeNull();
		expect(contact?.company?.domain).toBe(domain);

		const thread = await db.emailThread.findUnique({
			where: { rootMessageId: `<everyone-${suffix}@mail.test>` },
			select: { contactId: true },
		});
		expect(thread?.contactId).toBe(contact?.id ?? null);
	});
});
