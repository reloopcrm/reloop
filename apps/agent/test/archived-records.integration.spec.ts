import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { DealStage, db, FactStatus } from "@crm/db";
import * as safeFetchModule from "@crm/db/safe-fetch";
import type { ToolContext } from "eve/tools";
import { COPY } from "../agent/lib/copy";
import {
	contactsNeedingWork,
	NOT_LIVE,
	personForVerification,
	stampSocialsChecked,
} from "../agent/lib/crm";
import { recordFact, writeBrief } from "../agent/lib/facts";
import { writeField } from "../agent/lib/fields";
import { say } from "../agent/lib/language";
import { listDeals, searchCrm } from "../agent/lib/lookup";
import { runPortrait } from "../agent/lib/portrait";
import recordJobChange from "../agent/tools/record_job_change";
import researchCompany from "../agent/tools/research_company";
import { inEveContext, researchCtx } from "./eve-context";

const suffix = process.env.TEST_RUN_ID ?? "archived-records-spec";
const liveDomain = `ashgrove-${suffix}.test`;
const archivedDomain = `ashgrove-old-${suffix}.test`;
const fieldKey = `tier_${suffix.replace(/[^a-z0-9]/gi, "_")}`.toLowerCase();
const missing = `missing-${suffix}`;

const ctx = researchCtx as unknown as ToolContext;

const fetches = spyOn(safeFetchModule, "safeFetch").mockImplementation(
	async () => {
		throw new Error("an archived record must not reach the website");
	},
);

let ownerId: string;
let liveCompanyId: string;
let archivedCompanyId: string;
let liveContactId: string;
let archivedContactId: string;
let liveDealId: string;
let archivedDealId: string;
let dealOnArchivedCompanyId: string;
let fieldId: string;

const savedBlob = process.env.BLOB_READ_WRITE_TOKEN;

beforeAll(async () => {
	await cleanup();

	ownerId = (
		await db.user.create({
			data: {
				id: `owner-${suffix}`,
				name: "Rep Owner",
				email: `owner.${suffix}@example.test`,
			},
			select: { id: true },
		})
	).id;

	liveCompanyId = (
		await db.company.create({
			data: { name: `Ashgrove ${suffix}`, domain: liveDomain, ownerId },
			select: { id: true },
		})
	).id;

	archivedCompanyId = (
		await db.company.create({
			data: {
				name: `Ashgrove Old ${suffix}`,
				domain: archivedDomain,
				ownerId,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;

	liveContactId = (
		await db.contact.create({
			data: {
				firstName: "Mara",
				lastName: `Quill${suffix}`,
				email: `mara@${liveDomain}`,
				companyId: liveCompanyId,
				ownerId,
			},
			select: { id: true },
		})
	).id;

	archivedContactId = (
		await db.contact.create({
			data: {
				firstName: "Mara",
				lastName: `Quill${suffix}`,
				email: `mara.old@${liveDomain}`,
				companyId: liveCompanyId,
				ownerId,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;

	const deal = (name: string, companyId: string, archivedAt: Date | null) =>
		db.deal.create({
			data: {
				name,
				companyId,
				ownerId,
				stage: DealStage.QUALIFIED_TO_BUY,
				archivedAt,
			},
			select: { id: true },
		});

	liveDealId = (await deal(`Ashgrove renewal ${suffix}`, liveCompanyId, null))
		.id;
	archivedDealId = (
		await deal(`Ashgrove renewal old ${suffix}`, liveCompanyId, new Date())
	).id;
	dealOnArchivedCompanyId = (
		await deal(`Ashgrove renewal gone ${suffix}`, archivedCompanyId, null)
	).id;

	fieldId = (
		await db.fieldDefinition.create({
			data: {
				entity: "CONTACT",
				key: fieldKey,
				label: `Tier ${suffix}`,
				type: "TEXT",
				agentFilled: true,
				position: 9_999,
			},
			select: { id: true },
		})
	).id;
});

afterAll(async () => {
	fetches.mockRestore();
	if (savedBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
	else process.env.BLOB_READ_WRITE_TOKEN = savedBlob;
	await cleanup();
});

async function cleanup(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain: { in: [liveDomain, archivedDomain] } },
		select: { id: true },
	});
	const ids = companies.map((company) => company.id);

	await db.fieldDefinition.deleteMany({
		where: { entity: "CONTACT", key: fieldKey },
	});

	if (ids.length > 0) {
		await db.activity.deleteMany({ where: { companyId: { in: ids } } });
		await db.deal.deleteMany({ where: { companyId: { in: ids } } });
		await db.contact.deleteMany({ where: { companyId: { in: ids } } });
		await db.company.deleteMany({ where: { id: { in: ids } } });
	}

	await db.user.deleteMany({ where: { id: `owner-${suffix}` } });
}

describe("the agent's lookups hide archived records", () => {
	it("search_crm finds the live contact, company and deal only", async () => {
		const result = await searchCrm(`Ashgrove ${suffix}`);
		const companies = result.companies.map((hit) => hit.id);
		const deals = result.deals.map((hit) => hit.id);

		expect(companies).toContain(liveCompanyId);
		expect(companies).not.toContain(archivedCompanyId);
		expect(deals).toContain(liveDealId);
		expect(deals).not.toContain(archivedDealId);
		expect(deals).not.toContain(dealOnArchivedCompanyId);
		expect(
			result.companies.find((hit) => hit.id === liveCompanyId),
		).toMatchObject({ contacts: 1, deals: 1 });

		const people = await searchCrm(`Quill${suffix}`);
		expect(people.contacts.map((hit) => hit.id)).toEqual([liveContactId]);
	});

	it("search_crm finds nothing archived even by its exact name", async () => {
		const result = await searchCrm(`Ashgrove Old ${suffix}`);

		expect(result.companies.map((hit) => hit.id)).not.toContain(
			archivedCompanyId,
		);
		expect(result.deals.map((hit) => hit.id)).not.toContain(
			dealOnArchivedCompanyId,
		);
	});

	it("list_deals leaves out archived deals and deals of archived companies", async () => {
		const onLive = await listDeals({ status: "all", companyId: liveCompanyId });
		expect(onLive.deals.map((deal) => deal.id)).toEqual([liveDealId]);

		const onArchived = await listDeals({
			status: "all",
			companyId: archivedCompanyId,
		});
		expect(onArchived.deals).toHaveLength(0);
	});

	it("list_outstanding_work does not hand out an archived contact", async () => {
		const work = await contactsNeedingWork(10_000);
		const ids = work.map((item) => item.id);

		expect(ids).toContain(liveContactId);
		expect(ids).not.toContain(archivedContactId);
	});

	it("verification finds no person behind an archived contact", async () => {
		expect(await personForVerification(archivedContactId)).toBeNull();
	});
});

describe("the agent's writes refuse an archived or missing record", () => {
	const evidence = [
		{
			kind: "linkedin.employer-and-name" as const,
			detail: "The profile names Mara Quill at Ashgrove.",
			sourceUrl: "https://www.linkedin.com/in/mara-quill",
		},
	];

	it("write_brief refuses an archived contact and a missing one without a database error", async () => {
		for (const contactId of [archivedContactId, missing]) {
			const result = await writeBrief({
				contactId,
				narrative: "Mara Quill runs operations at Ashgrove.",
				sections: {},
				evidence,
			});

			expect(result).toMatchObject({
				written: false,
				reason: NOT_LIVE.contact,
			});
		}

		expect(
			await db.contactBrief.count({ where: { contactId: archivedContactId } }),
		).toBe(0);
	});

	it("record_fact refuses an archived contact", async () => {
		const result = await recordFact({
			contactId: archivedContactId,
			field: "title",
			value: "Head of Operations",
			evidence,
			method: "linkedin.profile",
		});

		expect(result).toMatchObject({ stored: false, reason: NOT_LIVE.contact });
		expect(
			await db.contactFact.count({
				where: { contactId: archivedContactId, status: FactStatus.APPLIED },
			}),
		).toBe(0);
	});

	it("stamping socials leaves an archived contact alone and does not throw on a missing one", async () => {
		expect(await stampSocialsChecked(archivedContactId)).toBe(false);
		expect(await stampSocialsChecked(missing)).toBe(false);

		const row = await db.contact.findUniqueOrThrow({
			where: { id: archivedContactId },
			select: { socialsCheckedAt: true },
		});
		expect(row.socialsCheckedAt).toBeNull();
	});

	it("fetch_contact_photo refuses an archived contact", async () => {
		process.env.BLOB_READ_WRITE_TOKEN = "blob-test-token";

		const result = await runPortrait({ contactId: archivedContactId });

		expect(result).toMatchObject({
			stored: false,
			reason: say(COPY.portraits.noContact),
		});
	});

	it("set_field_value refuses an archived contact and a missing one", async () => {
		for (const recordId of [archivedContactId, missing]) {
			const result = await writeField({
				entity: "CONTACT",
				recordId,
				key: fieldKey,
				value: "A",
			});

			expect(result).toEqual({ written: false, reason: NOT_LIVE.contact });
		}

		expect(await db.fieldValue.count({ where: { fieldId } })).toBe(0);
	});

	it("record_job_change refuses an archived contact", async () => {
		const result = await inEveContext(() =>
			recordJobChange.execute({ contactId: archivedContactId }, ctx),
		);

		expect(result).toEqual({ raised: false, reason: NOT_LIVE.contact });
	});

	it("record_job_change does not move a contact to an archived or missing company", async () => {
		for (const moveToCompanyId of [archivedCompanyId, missing]) {
			const result = await inEveContext(() =>
				recordJobChange.execute(
					{ contactId: liveContactId, moveToCompanyId },
					ctx,
				),
			);

			expect(result).toEqual({ raised: false, reason: NOT_LIVE.company });
		}

		const row = await db.contact.findUniqueOrThrow({
			where: { id: liveContactId },
			select: { companyId: true },
		});
		expect(row.companyId).toBe(liveCompanyId);
	});

	it("research_company refuses an archived company before it reads the website", async () => {
		fetches.mockClear();

		const result = await inEveContext(() =>
			researchCompany.execute({ companyId: archivedCompanyId }, ctx),
		);

		expect(result).toEqual({ written: false, reason: NOT_LIVE.company });
		expect(fetches).not.toHaveBeenCalled();
		expect(
			await db.activity.count({ where: { companyId: archivedCompanyId } }),
		).toBe(0);
	});
});
