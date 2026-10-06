import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import type { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import type { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { ConversionService } from "../src/currency/conversion.service";
import type { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";

const suffix = process.env.TEST_RUN_ID ?? "archive-purge-spec";
const domain = `purge-${suffix}.test`;
const archivedAt = new Date("2001-01-01T00:00:00Z");
const before = new Date("2001-01-02T00:00:00Z");

const stamp = new ActivityStampService(db);

const participants = new ThreadParticipantsService(
	db,
	new MailboxMatchService(db, {} as never, {} as never, {} as never),
	stamp,
	{} as never,
);
const contacts = new ContactsService(
	db,
	{} as unknown as CompanyDirectoryService,
	{} as unknown as AgentTriggerService,
	{} as unknown as AgentQueueService,
	stamp,
	{} as unknown as FieldsService,
	participants,
);

const companies = new CompaniesService(
	db,
	{} as unknown as AgentTriggerService,
	{} as unknown as AgentQueueService,
	{} as unknown as FaviconService,
	stamp,
	{} as unknown as ConversionService,
	{} as unknown as FieldsService,
);

async function clean() {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { name: { endsWith: `-${suffix}` } } });
	await db.suppressedContact.deleteMany({
		where: { email: { endsWith: `@${domain}` } },
	});
}

beforeAll(clean);
afterAll(clean);

async function contactOf(source: RecordSource, name: string) {
	const row = await db.contact.create({
		data: {
			firstName: name,
			email: `${name}@${domain}`,
			source,
			archivedAt,
		},
		select: { id: true },
	});
	return row.id;
}

async function companyOf(source: RecordSource, name: string) {
	const row = await db.company.create({
		data: { name: `${name}-${suffix}`, source, archivedAt },
		select: { id: true },
	});
	return row.id;
}

describe("purging archived records after the retention", () => {
	it("keeps contacts that the sync archived and purges the rest", async () => {
		const email = await contactOf(RecordSource.EMAIL, "mail");
		const calendar = await contactOf(RecordSource.CALENDAR, "meeting");
		const manual = await contactOf(RecordSource.MANUAL, "manual");

		await contacts.purgeExpired(before);

		expect(
			await db.contact.findUnique({ where: { id: email } }),
		).not.toBeNull();
		expect(
			await db.contact.findUnique({ where: { id: calendar } }),
		).not.toBeNull();
		expect(await db.contact.findUnique({ where: { id: manual } })).toBeNull();
	});

	it("keeps companies that the sync archived and purges the rest", async () => {
		const email = await companyOf(RecordSource.EMAIL, "mail");
		const calendar = await companyOf(RecordSource.CALENDAR, "meeting");
		const manual = await companyOf(RecordSource.MANUAL, "manual");

		await companies.purgeExpired(before);

		expect(
			await db.company.findUnique({ where: { id: email } }),
		).not.toBeNull();
		expect(
			await db.company.findUnique({ where: { id: calendar } }),
		).not.toBeNull();
		expect(await db.company.findUnique({ where: { id: manual } })).toBeNull();
	});

	it("still lets a person delete a sync-archived contact by hand", async () => {
		const id = await contactOf(RecordSource.EMAIL, "hand");

		await contacts.purge(id);

		expect(await db.contact.findUnique({ where: { id } })).toBeNull();
	});
});
