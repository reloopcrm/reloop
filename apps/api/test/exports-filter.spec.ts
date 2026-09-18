import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { contactListInput } from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { ExportsService } from "../src/exports/exports.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = crypto.randomUUID().slice(0, 8);
const domain = `exports-${suffix}.test`;
const mineId = `exports-owner-mine-${suffix}`;
const theirsId = `exports-owner-theirs-${suffix}`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	companyRequested: async () => true,
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const queue = new AgentQueueService(db);
const conversion = new ConversionService(db);
const fields = new FieldsService(db, agent);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	queue,
	stamp,
	fields,
);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const deals = new DealsService(db, agent, stamp, conversion, fields);
const exports = new ExportsService(db, contacts, companies, deals, fields);

let companyId = "";

async function read(owner: string[]): Promise<string> {
	const file = await exports.file({
		entity: "contacts",
		filter: contactListInput.parse({ owner }),
		locale: "en",
		zone: "UTC",
	});

	let text = "";
	for await (const chunk of file.lines) text += chunk;
	return text;
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{ id: mineId, name: "Mine", email: `${mineId}@example.test` },
			{ id: theirsId, name: "Theirs", email: `${theirsId}@example.test` },
		],
	});

	const company = await db.company.create({
		data: { name: `Exports ${suffix}`, domain },
	});
	companyId = company.id;

	await db.contact.createMany({
		data: [
			{
				firstName: "=SUM(A1:A9)",
				lastName: "Mine",
				email: `mine-${suffix}@${domain}`,
				phone: "+49 170 1234567",
				companyId,
				ownerId: mineId,
			},
			{
				firstName: "Theirs",
				lastName: "Other",
				email: `theirs-${suffix}@${domain}`,
				companyId,
				ownerId: theirsId,
			},
		],
	});
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: { in: [mineId, theirsId] } } });
});

describe("the CSV export", () => {
	it("exports the filtered list, not the whole table", async () => {
		const text = await read([mineId]);

		expect(text).toContain(`mine-${suffix}@${domain}`);
		expect(text).not.toContain(`theirs-${suffix}@${domain}`);
	});

	it("exports both rows when nothing is filtered", async () => {
		const text = await read([]);

		expect(text).toContain(`mine-${suffix}@${domain}`);
		expect(text).toContain(`theirs-${suffix}@${domain}`);
	});

	it("neutralises a value Excel would read as a formula", async () => {
		const text = await read([mineId]);

		expect(text).toContain("'=SUM(A1:A9)");
		expect(text).toContain("'+49 170 1234567");
		expect(text).not.toContain(";=SUM(A1:A9)");
	});

	it("starts with a byte order mark and a header row", async () => {
		const text = await read([mineId]);

		expect(text.startsWith("﻿First name;Last name;Email;")).toBe(true);
		expect(text).toContain("\r\n");
	});
});
