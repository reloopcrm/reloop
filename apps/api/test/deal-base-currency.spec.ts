import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { SETTINGS_ID, writeReportingCurrency } from "@crm/db/settings";
import type { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deal-base-currency-spec";
const userId = `user-${suffix}`;
const domain = `basecurrency-${suffix}.test`;
const AMOUNT = 100_000_000;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;
const stamp = new ActivityStampService(db);
const conversion = new ConversionService(db);
const fields = new FieldsService(db, {
	fieldBackfill: async () => undefined,
} as never);
const deals = new DealsService(db, agent, stamp, conversion, fields);
const companies = new CompaniesService(
	db,
	agent,
	{ isQueued: async () => false } as unknown as AgentQueueService,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);

let companyId: string;
let dealId: string;
let previousReportingCurrency: string | null = null;

const listInput = {
	q: "",
	page: 1,
	pageSize: 25,
	sort: "",
	dir: "asc" as const,
	status: "all",
	owner: [userId],
	stage: [],
	closing: [],
	fields: {},
	archived: false,
};

beforeAll(async () => {
	const existing = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { reportingCurrency: true },
	});
	previousReportingCurrency = existing?.reportingCurrency ?? null;
	await writeReportingCurrency(db, "USD");

	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Base Tester",
			email: `base@${domain}`,
			emailVerified: true,
		},
		update: {},
	});
	const company = await db.company.upsert({
		where: { domain },
		create: { name: `Base Co ${suffix}`, domain },
		update: {},
		select: { id: true },
	});
	companyId = company.id;

	const deal = await db.deal.create({
		data: {
			name: `Base Deal ${suffix}`,
			companyId,
			ownerId: userId,
			amount: "1000000",
			currency: "USD",
			baseAmount: "1000000",
			baseCurrency: "USD",
		},
		select: { id: true },
	});
	dealId = deal.id;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });

	if (previousReportingCurrency) {
		await writeReportingCurrency(db, previousReportingCurrency);
	} else {
		await db.appSetting.updateMany({ data: { reportingCurrency: null } });
	}
});

async function seenFigures() {
	const detail = await deals.byId(dealId);
	const list = await deals.list(listInput);
	const board = await deals.board({ ...listInput, status: "open" });
	const company = await companies.byId(companyId);
	const card = board.columns
		.flatMap((column) => column.deals)
		.find((row) => row.id === dealId);

	return {
		detail: detail.baseAmountCents,
		list: list.rows.find((row) => row.id === dealId)?.baseAmountCents,
		card: card?.baseAmountCents,
		company: company.deals.find((row) => row.id === dealId)?.baseAmountCents,
	};
}

describe("a deal figure in the reporting currency", () => {
	it("shows the converted amount while the base matches", async () => {
		expect(await seenFigures()).toEqual({
			detail: AMOUNT,
			list: AMOUNT,
			card: AMOUNT,
			company: AMOUNT,
		});
	});

	it("shows no figure when the reporting currency changed and the deal is not re-rated", async () => {
		await writeReportingCurrency(db, "EUR");

		expect(await seenFigures()).toEqual({
			detail: null,
			list: null,
			card: null,
			company: null,
		});
	});
});
