import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { CompanyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import type { ContactListInput } from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "standing-spec";
const domain = `standing-${suffix}.test`;

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

const CONTACT_LIST: ContactListInput = {
	q: domain,
	sort: "",
	dir: "asc",
	page: 1,
	pageSize: 25,
	owner: [],
	company: [],
	source: [],
	title: [],
	seniority: [],
	persona: [],
	standing: [],
	potential: [],
	activity: [],
	fields: {},
	archived: false,
};

const COMPANY_LIST: CompanyListInput = {
	q: domain,
	sort: "",
	dir: "asc",
	page: 1,
	pageSize: 25,
	owner: [],
	industry: [],
	enrichment: [],
	source: [],
	standing: [],
	potential: [],
	activity: [],
	fields: {},
	archived: false,
};

async function clean() {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
}

beforeAll(async () => {
	await clean();

	await db.contact.createMany({
		data: [
			{
				firstName: "Ada",
				email: `ada@${domain}`,
				standing: "customer",
				potentialBand: "high",
			},
			{
				firstName: "Grace",
				email: `grace@${domain}`,
				standing: "interested",
				potentialBand: "medium",
			},
			{
				firstName: "Alan",
				email: `alan@${domain}`,
				standing: "watch",
				potentialBand: "low",
			},
			{ firstName: "Edsger", email: `edsger@${domain}` },
		],
	});

	await db.company.createMany({
		data: [
			{
				name: `Pallet Works ${suffix}`,
				domain: `pallets.${domain}`,
				standing: "customer",
				potentialBand: "high",
			},
			{
				name: `Crate Co ${suffix}`,
				domain: `crates.${domain}`,
				standing: "interested",
				potentialBand: "medium",
			},
			{ name: `Box Ltd ${suffix}`, domain: `boxes.${domain}` },
		],
	});
});

afterAll(clean);

describe("the contacts list", () => {
	it("carries the standing and the potential the agent wrote", async () => {
		const { rows } = await contacts.list(CONTACT_LIST);

		expect(rows.find((row) => row.firstName === "Ada")).toMatchObject({
			standing: "customer",
			potential: "high",
		});
		expect(rows.find((row) => row.firstName === "Edsger")).toMatchObject({
			standing: null,
			potential: null,
		});
	});

	it("keeps only the standing the rep asked for", async () => {
		const { rows, total } = await contacts.list({
			...CONTACT_LIST,
			standing: ["interested"],
		});

		expect(total).toBe(1);
		expect(rows.map((row) => row.firstName)).toEqual(["Grace"]);
	});

	it("keeps every potential the rep asked for", async () => {
		const { rows } = await contacts.list({
			...CONTACT_LIST,
			potential: ["high", "medium"],
		});

		expect(rows.map((row) => row.potential).sort()).toEqual(["high", "medium"]);
	});

	it("counts a standing and a potential the same way it counts a seniority", async () => {
		const { facetCounts } = await contacts.list(CONTACT_LIST);

		expect(facetCounts.standing).toEqual({
			customer: 1,
			interested: 1,
			watch: 1,
		});
		expect(facetCounts.potential).toEqual({ high: 1, medium: 1, low: 1 });
	});

	it("sorts by standing and puts the contacts with none last", async () => {
		const { rows } = await contacts.list({
			...CONTACT_LIST,
			sort: "standing",
			dir: "asc",
		});

		expect(rows.map((row) => row.standing)).toEqual([
			"customer",
			"interested",
			"watch",
			null,
		]);
	});

	it("sorts by potential and puts the contacts with none last", async () => {
		const { rows } = await contacts.list({
			...CONTACT_LIST,
			sort: "potential",
			dir: "asc",
		});

		expect(rows.at(-1)?.potential).toBeNull();
	});
});

describe("the companies list", () => {
	it("carries the standing and the potential the agent wrote", async () => {
		const { rows } = await companies.list(COMPANY_LIST);

		expect(
			rows.find((row) => row.domain === `pallets.${domain}`),
		).toMatchObject({ standing: "customer", potential: "high" });
		expect(rows.find((row) => row.domain === `boxes.${domain}`)).toMatchObject({
			standing: null,
			potential: null,
		});
	});

	it("keeps only the potential the rep asked for", async () => {
		const { rows, total } = await companies.list({
			...COMPANY_LIST,
			potential: ["high"],
		});

		expect(total).toBe(1);
		expect(rows.map((row) => row.domain)).toEqual([`pallets.${domain}`]);
	});

	it("counts a standing and a potential the same way it counts an industry", async () => {
		const { facetCounts } = await companies.list(COMPANY_LIST);

		expect(facetCounts.standing).toEqual({ customer: 1, interested: 1 });
		expect(facetCounts.potential).toEqual({ high: 1, medium: 1 });
	});

	it("sorts by standing and puts the companies with none last", async () => {
		const { rows } = await companies.list({
			...COMPANY_LIST,
			sort: "standing",
			dir: "asc",
		});

		expect(rows.map((row) => row.standing)).toEqual([
			"customer",
			"interested",
			null,
		]);
	});
});
