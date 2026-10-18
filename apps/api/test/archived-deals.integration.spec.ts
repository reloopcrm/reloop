import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { CompanyListInput } from "../src/companies/companies.contracts";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "archived-deals-spec";
const domain = `archived-deals-${suffix}.test`;
const userId = `user-${suffix}-archived-deals`;

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
const dashboard = new DashboardService(db, conversion);

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

let companyId: string;
let contactId: string;
const ids = {
	liveOpen: "",
	liveWon: "",
	lost: "",
	archivedOpen: "",
	archivedWon: "",
	archivedPending: "",
};

async function clean() {
	await db.deal.deleteMany({ where: { ownerId: userId } });
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function deal(
	name: string,
	options: {
		stage: DealStage;
		amount: number;
		base: string | null;
		currency: string;
		archived?: boolean;
	},
) {
	const now = new Date();
	const closed =
		options.stage === DealStage.CLOSED_WON ||
		options.stage === DealStage.CLOSED_LOST;
	const row = await db.deal.create({
		data: {
			name: `${name} ${suffix}`,
			companyId,
			ownerId: userId,
			stage: options.stage,
			amount: options.amount,
			currency: options.currency,
			baseAmount: options.base ? options.amount : null,
			baseCurrency: options.base,
			fxRate: options.base ? 1 : null,
			fxRateAt: options.base ? now : null,
			expectedCloseDate: closed ? null : now,
			closedAt: closed ? now : null,
			archivedAt: options.archived ? now : null,
		},
		select: { id: true },
	});
	return row.id;
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: userId,
			name: "Archive Tester",
			email: `owner@${domain}`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Archived Deals ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const contact = await db.contact.create({
		data: { firstName: "Buyer", email: `buyer@${domain}`, companyId },
		select: { id: true },
	});
	contactId = contact.id;

	const base = await conversion.reportingCurrency();

	ids.liveOpen = await deal("Live open", {
		stage: DealStage.DEMO_BOOKED,
		amount: 1_000,
		base,
		currency: base,
	});
	ids.liveWon = await deal("Live won", {
		stage: DealStage.CLOSED_WON,
		amount: 2_000,
		base,
		currency: base,
	});
	ids.lost = await deal("Lost in CHF", {
		stage: DealStage.CLOSED_LOST,
		amount: 3_000,
		base: null,
		currency: "CHF",
	});
	ids.archivedOpen = await deal("Archived open", {
		stage: DealStage.DEMO_BOOKED,
		amount: 500_000,
		base,
		currency: base,
		archived: true,
	});
	ids.archivedWon = await deal("Archived won", {
		stage: DealStage.CLOSED_WON,
		amount: 700_000,
		base,
		currency: base,
		archived: true,
	});
	ids.archivedPending = await deal("Archived open in CHF", {
		stage: DealStage.DEMO_BOOKED,
		amount: 4_000,
		base: null,
		currency: "CHF",
		archived: true,
	});

	await db.dealContact.createMany({
		data: [
			{ dealId: ids.liveOpen, contactId },
			{ dealId: ids.archivedOpen, contactId },
		],
	});
});

afterAll(clean);

describe("an archived deal leaves every total", () => {
	it("counts no archived deal on the dashboard", async () => {
		const summary = await dashboard.summary(userId, { scope: "me" });

		expect(summary.pipeline.totalDeals).toBe(1);
		expect(summary.pipeline.totalCents).toBe(100_000);
		expect(
			summary.pipeline.stages.find(
				(stage) => stage.stage === DealStage.DEMO_BOOKED,
			),
		).toEqual({ stage: DealStage.DEMO_BOOKED, count: 1, valueCents: 100_000 });
		expect(summary.closingThisMonthTotal).toEqual({
			count: 1,
			valueCents: 100_000,
		});
		expect(summary.biggestOpen.map((row) => row.id)).toEqual([ids.liveOpen]);
		expect(summary.wonThisMonth).toEqual({ count: 1, valueCents: 200_000 });
		expect(summary.performance.wins).toBe(1);
		expect(summary.performance.losses).toBe(1);
		expect(summary.performance.avgDealCents).toBe(200_000);
		expect(summary.trend.at(-1)).toMatchObject({
			won: 200_000,
			created: 300_000,
		});
	});

	it("does not report a lost or archived deal as left out of the totals", async () => {
		const summary = await dashboard.summary(userId, { scope: "me" });

		expect(summary.unconverted).toEqual({ count: 0, currencies: [] });
	});

	it("reports an open deal it cannot convert as left out of the totals", async () => {
		const pending = await deal("Live open in CHF", {
			stage: DealStage.DEMO_BOOKED,
			amount: 5_000,
			base: null,
			currency: "CHF",
		});

		try {
			const summary = await dashboard.summary(userId, { scope: "me" });
			expect(summary.unconverted).toEqual({ count: 1, currencies: ["CHF"] });
		} finally {
			await db.deal.delete({ where: { id: pending } });
		}
	});

	it("leaves an archived deal out of the company list and the company sheet", async () => {
		const { rows } = await companies.list(COMPANY_LIST);
		const row = rows.find((entry) => entry.id === companyId);
		expect(row?.openDealCount).toBe(1);

		const company = await companies.byId(companyId);
		expect(company.deals.map((entry) => entry.id).sort()).toEqual(
			[ids.liveOpen, ids.liveWon, ids.lost].sort(),
		);
		expect(company.dealCount).toBe(6);
	});

	it("leaves an archived deal out of the contact sheet", async () => {
		const contact = await contacts.byId(contactId);
		expect(contact.deals.map((entry) => entry.id)).toEqual([ids.liveOpen]);
	});
});
