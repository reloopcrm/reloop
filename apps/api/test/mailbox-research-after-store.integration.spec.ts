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

const suffix = crypto.randomUUID();
const domain = `after-store-${suffix}.example.com`;
const userId = `after-store-rep-${suffix}`;
const mailbox = `rep-${suffix}@example.com`;
const buyer = `anna.preview@${domain}`;
const rootId = `<after-store-${suffix}@mail.example>`;

const seen: { contactId: string; mails: number }[] = [];

async function mailsOf(contactId: string): Promise<number> {
	const contact = await db.contact.findUniqueOrThrow({
		where: { id: contactId },
		select: { email: true },
	});
	const email = contact.email ?? "";
	return db.emailMessage.count({
		where: {
			OR: [
				{ fromEmail: email },
				{ recipients: { array_contains: [{ email }] } },
			],
		},
	});
}

const agent = {
	contactCreated: async (contactId: string) => {
		seen.push({ contactId, mails: await mailsOf(contactId) });
		return true;
	},
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	log,
);
const threads = new ThreadWriterService(db, match, stamp, agent);

let row: MailboxSync;

function message(): IncomingMessage {
	return {
		rfcMessageId: `<one-${suffix}@mail.example>`,
		rootId,
		subject: "Paletten",
		from: { email: mailbox, name: "Preview Rep" },
		recipients: [{ email: buyer, name: "Anna Preview", kind: "to" }],
		body: "Hier ist das Angebot für die Paletten.",
		sentAt: new Date("2026-09-01T10:00:00Z"),
		gmailMessageId: null,
		outlookMessageId: null,
		outlookWebLink: null,
	};
}

async function clean(): Promise<void> {
	await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
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
		data: { userId, source: "gmail", autoCreate: true },
	});
});

afterAll(clean);

describe("research for a contact the sync creates from a new mail", () => {
	it("is queued only after the mail is stored, so the pre-check sees it", async () => {
		const stored = await threads.store(
			row,
			{ origin: "gmail", lane: "forward" },
			message(),
			await threads.context(),
		);

		expect(stored).toBe(true);
		const contact = await db.contact.findUniqueOrThrow({
			where: { email: buyer },
			select: { id: true },
		});
		expect(seen).toEqual([{ contactId: contact.id, mails: 1 }]);
	});
});
