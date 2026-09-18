import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { QUOTE_DEALS } from "@crm/db/quote-deals";
import {
	DEFAULT_WIN_BACK_RULES,
	readWinBackRules,
	writeWinBackRules,
} from "@crm/validation/win-back-rules";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { QuotesService } from "../src/quotes/quotes.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "quotes-spec";
const userId = `quote-rep-${suffix}`;
const domain = `quotes-${suffix}.test`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

const quotes = new QuotesService(db, deals);

const brokenAttach = new QuotesService(db, {
	create: deals.create.bind(deals),
	attachContact: async () => {
		throw new Error("The contact could not be attached.");
	},
} as unknown as DealsService);

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	business: {
		...DEFAULT_WIN_BACK_RULES.business,
		minPallets: 20,
		minBoxes: 5,
		boxProducts: ["Gitterbox"],
		unit: "pallets",
	},
};

let savedRules = DEFAULT_WIN_BACK_RULES;

type Fixture = {
	key: string;
	company: string;
	outcome?: string;
	relevant?: boolean;
	quantityPallets?: number | null;
	daysAgo?: number;
	openDeal?: boolean;
	prefix?: string;
};

const ids: Record<string, { threadId: string; companyId: string }> = {};

async function make(fixture: Fixture): Promise<void> {
	const prefix = fixture.prefix ?? "";
	const companyId = `${prefix}company-${fixture.key}-${suffix}`;
	const contactId = `${prefix}contact-${fixture.key}-${suffix}`;
	const threadId = `${prefix}thread-${fixture.key}-${suffix}`;
	const sentAt = new Date(Date.now() - (fixture.daysAgo ?? 3) * 86_400_000);

	await db.company.create({
		data: {
			id: companyId,
			name: fixture.company,
			domain: `${fixture.key}.${domain}`,
		},
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: "Nora",
			lastName: fixture.company,
			email: `nora@${fixture.key}.${domain}`,
			companyId,
			ownerId: userId,
		},
	});

	if (fixture.openDeal) {
		await db.deal.create({
			data: {
				name: `${fixture.company} deal`,
				companyId,
				ownerId: userId,
				stage: DealStage.QUALIFIED_TO_BUY,
			},
		});
	}

	await db.emailThread.create({
		data: {
			id: threadId,
			rootMessageId: `${threadId}@${domain}`,
			subject: `Offer for ${fixture.company}`,
			companyId,
			contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messageCount: 2,
			insight: {
				create: {
					relevant: fixture.relevant ?? true,
					topics: [],
					products: ["Europalette"],
					quantityPallets:
						fixture.quantityPallets === undefined
							? 40
							: fixture.quantityPallets,
					outcome: fixture.outcome ?? "QUOTED",
					summary: `We quoted ${fixture.company}.`,
					evidence: [],
					modelId: "test",
					lastMessageAt: sentAt,
				},
			},
		},
	});

	ids[fixture.key] = { threadId, companyId };
}

async function clean(): Promise<void> {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.deal.deleteMany({
		where: { company: { domain: { endsWith: domain } } },
	});
	await db.contact.deleteMany({
		where: { email: { endsWith: `.${domain}` } },
	});
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	savedRules = await readWinBackRules(db);
	await writeWinBackRules(db, rules);

	await db.user.create({
		data: {
			id: userId,
			name: "Quote Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});

	await make({ key: "waiting", company: "Waiting Co" });
	await make({ key: "already", company: "Already Co", openDeal: true });
	await make({ key: "aside", company: "Aside Co" });
	await make({ key: "small", company: "Small Co", quantityPallets: 4 });
	await make({ key: "silent", company: "Silent Co", quantityPallets: null });
	await make({
		key: "asked",
		company: "Asked Co",
		outcome: "OPEN_INQUIRY_THEIRS",
	});
	await make({
		key: "stale",
		company: "Stale Co",
		daysAgo: QUOTE_DEALS.thread.maxAgeDays + 10,
	});
	await make({ key: "sample", company: "Sample Co", prefix: "demo-" });
});

afterAll(async () => {
	await clean();
	await writeWinBackRules(db, savedRules);
});

function names(rows: { company: { name: string } }[]): string[] {
	return rows
		.map((row) => row.company.name)
		.filter((name) => name.endsWith(" Co"))
		.sort();
}

describe("quotes waiting for a deal", () => {
	it("shows only the offers that are worth a rep's attention", async () => {
		const list = await quotes.list();

		expect(names(list.rows)).toEqual(["Aside Co", "Waiting Co"]);
		expect(list.stage).toBe(DealStage.CONTRACT_SENT);
		expect(list.unit).toBe("pallets");

		const waiting = list.rows.find((row) => row.company.name === "Waiting Co");
		expect(waiting?.threadId).toBe(ids.waiting?.threadId);
		expect(waiting?.contact?.email).toBe(`nora@waiting.${domain}`);
		expect(waiting?.quantityPallets).toBe(40);
	});

	it("never brings back a quote the rep put aside", async () => {
		const threadId = ids.aside?.threadId ?? "";
		await quotes.dismiss(threadId);

		expect(names((await quotes.list()).rows)).toEqual(["Waiting Co"]);
		await expect(quotes.dismiss(threadId)).rejects.toThrow(
			"That quote is no longer waiting.",
		);
	});

	it("creates the deal on the quoted stage, with the company and the contact", async () => {
		const threadId = ids.waiting?.threadId ?? "";
		const created = await quotes.create(userId, threadId);

		const deal = await db.deal.findUniqueOrThrow({
			where: { id: created.dealId },
			select: {
				name: true,
				stage: true,
				companyId: true,
				ownerId: true,
				amount: true,
				baseAmount: true,
				contacts: { select: { contactId: true } },
			},
		});

		expect(deal.stage).toBe(DealStage.CONTRACT_SENT);
		expect(deal.companyId).toBe(ids.waiting?.companyId ?? "");
		expect(deal.ownerId).toBe(userId);
		expect(deal.name).toBe("Offer for Waiting Co");
		expect(deal.amount).toBeNull();
		expect(deal.baseAmount).toBeNull();
		expect(deal.contacts).toEqual([{ contactId: created.contactId ?? "" }]);
	});

	it("keeps one deal when the contact cannot be attached", async () => {
		await make({ key: "flaky", company: "Flaky Co" });
		const threadId = ids.flaky?.threadId ?? "";
		const created = await brokenAttach.create(userId, threadId);

		expect(created.contactId).toBeNull();

		const thread = await db.emailThread.findUniqueOrThrow({
			where: { id: threadId },
			select: { quoteHandledAt: true },
		});
		expect(thread.quoteHandledAt).not.toBeNull();

		const dealCount = await db.deal.count({
			where: { companyId: ids.flaky?.companyId ?? "" },
		});
		expect(dealCount).toBe(1);
	});

	it("takes the quote off the list once the deal exists", async () => {
		expect(names((await quotes.list()).rows)).toEqual([]);
		await expect(
			quotes.create(userId, ids.waiting?.threadId ?? ""),
		).rejects.toThrow("That quote is no longer waiting.");
	});
});
