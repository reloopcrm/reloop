import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, RecordSource } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = crypto.randomUUID();
const domain = `research-${suffix}.example.com`;
const userId = `research-rep-${suffix}`;

const queued: { contactId: string; reason: string }[] = [];

const agent = {
	contactCreated: async (contactId: string, reason: string) => {
		queued.push({ contactId, reason });
		return true;
	},
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	log,
);
const request = { source: RecordSource.EMAIL, ownerId: userId } as const;

let companyId: string;

async function clear(): Promise<void> {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clear();
	await db.user.create({
		data: {
			id: userId,
			name: "Preview Rep",
			email: `rep-${suffix}@example.com`,
		},
	});
	companyId = (
		await db.company.create({
			data: { name: "Preview Kunde", domain, source: "EMAIL" },
			select: { id: true },
		})
	).id;
});

beforeEach(() => {
	queued.length = 0;
});

afterAll(clear);

describe("a contact the sync adds to a company", () => {
	it("queues research when it has a real name", async () => {
		const added = await match.addCompanyContact(
			{ email: `anna.preview@${domain}`, name: "Anna Preview" },
			companyId,
			request,
		);

		expect(added.created).toBe(true);
		expect(queued).toEqual([
			{
				contactId: added.contactId ?? "",
				reason: "Emailed about your business",
			},
		]);
	});

	it("queues research when only the address names it", async () => {
		const added = await match.addCompanyContact(
			{ email: `einkauf@${domain}`, name: null },
			companyId,
			request,
		);

		expect(added.created).toBe(true);
		expect(queued).toEqual([
			{
				contactId: added.contactId ?? "",
				reason: "Created by the sync from an address, with no name on it",
			},
		]);
	});

	it("does not queue research again for a named contact it already has", async () => {
		const person = { email: `ben.preview@${domain}`, name: "Ben Preview" };
		await match.addCompanyContact(person, companyId, request);
		queued.length = 0;

		const again = await match.addCompanyContact(person, companyId, request);

		expect(again.created).toBe(false);
		expect(queued).toEqual([]);
	});
});
