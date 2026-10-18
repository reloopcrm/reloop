import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { companyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { contactListInput } from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { dealListInput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = crypto.randomUUID().slice(0, 8);
const domain = `export-order-${suffix}.test`;

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
const participants = new ThreadParticipantsService(
	db,
	new MailboxMatchService(db, {} as never, {} as never, {} as never),
	stamp,
	{} as never,
);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	queue,
	stamp,
	fields,
	participants,
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

const names = ["Delta", "Alpha", "Echo", "Bravo", "Charlie", "Foxtrot", "Golf"];
const ownerId = `export-order-owner-${suffix}`;
let companyId = "";
const companyIds: string[] = [];

async function collect<TRow extends { id: string }>(
	pages: AsyncGenerator<TRow[]>,
): Promise<{ ids: string[]; pages: number }> {
	const ids: string[] = [];
	let count = 0;
	for await (const page of pages) {
		count += 1;
		ids.push(...page.map((row) => row.id));
	}
	return { ids, pages: count };
}

beforeAll(async () => {
	await db.user.create({
		data: { id: ownerId, name: "Owner", email: `${ownerId}@example.test` },
	});
	const company = await db.company.create({
		data: { name: `Order ${suffix}`, domain },
	});
	companyId = company.id;

	await db.contact.createMany({
		data: names.map((name, index) => ({
			firstName: name,
			lastName: index % 2 === 0 ? "Same" : "Other",
			email: `${name.toLowerCase()}-${suffix}@${domain}`,
			companyId,
			lastActivityAt: index < 4 ? new Date(Date.UTC(2026, 0, index + 1)) : null,
		})),
	});

	for (const name of names) {
		const row = await db.company.create({
			data: {
				name: `${name} ${suffix}`,
				domain: `${name.toLowerCase()}-${suffix}.test`,
			},
		});
		companyIds.push(row.id);
		await db.deal.create({
			data: {
				name: `${name} deal ${suffix}`,
				companyId: row.id,
				ownerId: ownerId,
				stage: "DEMO_BOOKED",
				amount: "1.00",
				currency: "EUR",
			},
		});
	}
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { companyId } });
	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.company.deleteMany({
		where: { id: { in: [...companyIds, companyId] } },
	});
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("the export order", () => {
	for (const dir of ["asc", "desc"] as const) {
		it(`writes contacts sorted by name ${dir} across pages`, async () => {
			const input = contactListInput.parse({ q: suffix, sort: "name", dir });
			const listed = await contacts.list({ ...input, pageSize: 100 });
			const exported = await collect(contacts.exportRows(input, 3));

			expect(exported.pages).toBeGreaterThan(1);
			expect(exported.ids).toEqual(listed.rows.map((row) => row.id));
			expect(listed.rows.map((row) => row.firstName)).toEqual(
				dir === "asc" ? [...names].sort() : [...names].sort().reverse(),
			);
		});
	}

	it("keeps rows with an empty sort value in place across pages", async () => {
		const input = contactListInput.parse({
			q: suffix,
			sort: "lastActivity",
			dir: "desc",
		});
		const listed = await contacts.list({ ...input, pageSize: 100 });
		const exported = await collect(contacts.exportRows(input, 2));

		expect(exported.ids).toHaveLength(names.length);
		expect(new Set(exported.ids).size).toBe(names.length);
		expect(exported.ids.slice(0, 4)).toEqual(
			listed.rows.slice(0, 4).map((row) => row.id),
		);
	});

	it("keeps one order when a sort value changes between pages", async () => {
		const input = contactListInput.parse({
			q: suffix,
			sort: "name",
			dir: "asc",
		});
		const ids: string[] = [];
		let moved = false;

		for await (const page of contacts.exportRows(input, 2)) {
			ids.push(...page.map((row) => row.id));
			if (moved) continue;
			moved = true;
			await db.contact.updateMany({
				where: { companyId, firstName: "Golf" },
				data: { firstName: "Aaa" },
			});
		}

		expect(ids).toHaveLength(names.length);
		expect(new Set(ids).size).toBe(names.length);
		await db.contact.updateMany({
			where: { companyId, firstName: "Aaa" },
			data: { firstName: "Golf" },
		});
	});

	it("writes companies sorted by name desc across pages", async () => {
		const input = companyListInput.parse({
			q: suffix,
			sort: "name",
			dir: "desc",
		});
		const listed = await companies.list({ ...input, pageSize: 100 });
		const exported = await collect(companies.exportRows(input, 3));

		expect(exported.pages).toBeGreaterThan(1);
		expect(exported.ids).toEqual(listed.rows.map((row) => row.id));
	});

	it("writes deals sorted by name asc across pages", async () => {
		const input = dealListInput.parse({ q: suffix, sort: "name", dir: "asc" });
		const listed = await deals.list({ ...input, pageSize: 100 });
		const exported = await collect(deals.exportRows(input, 3));

		expect(exported.pages).toBeGreaterThan(1);
		expect(exported.ids).toEqual(listed.rows.map((row) => row.id));
		expect(exported.ids).toHaveLength(names.length);
	});
});
