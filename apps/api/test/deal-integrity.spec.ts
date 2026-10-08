import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, DealStage, db, type Prisma } from "@crm/db";
import type {
	AgentTriggerService,
	CrmEventInput,
} from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";

const suffix = process.env.TEST_RUN_ID ?? "deal-integrity-spec";
const userId = `user-${suffix}-deal-integrity`;
const domain = `deal-integrity-${suffix}.test`;

const events: CrmEventInput[] = [];

const agent = {
	withCrmEvents: <Result>(
		work: (
			tx: Prisma.TransactionClient,
			emit: (input: CrmEventInput) => Promise<void>,
		) => Promise<Result>,
	) =>
		db.$transaction((tx) =>
			work(tx, async (input) => {
				events.push(input);
			}),
		),
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

const LOST_WITHOUT_REASON =
	"Say why it was lost. A closed-lost deal with no reason teaches nobody anything.";

async function clean() {
	await db.deal.deleteMany({
		where: { company: { domain: { endsWith: domain } } },
	});
	await db.contact.deleteMany({
		where: { company: { domain: { endsWith: domain } } },
	});
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function company(key: string) {
	return db.company.create({
		data: { name: `${key} Co ${suffix}`, domain: `${key}.${domain}` },
		select: { id: true },
	});
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: {
			id: userId,
			name: "Integrity Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});
});

afterAll(clean);

describe("moving a deal to another company", () => {
	it("drops the people of the old company and moves the deal's activities", async () => {
		const from = await company("from");
		const to = await company("to");
		const leaving = await db.contact.create({
			data: { firstName: "Lea", lastName: "Leaving", companyId: from.id },
			select: { id: true },
		});
		const staying = await db.contact.create({
			data: { firstName: "Sam", lastName: "Staying", companyId: to.id },
			select: { id: true },
		});
		const loose = await db.contact.create({
			data: { firstName: "Lou", lastName: "Loose" },
			select: { id: true },
		});

		const deal = await deals.create({
			name: `Moving ${suffix}`,
			companyId: from.id,
			ownerId: userId,
		});
		await deals.attachContact({ dealId: deal.id, contactId: leaving.id });
		await db.dealContact.createMany({
			data: [
				{ dealId: deal.id, contactId: staying.id },
				{ dealId: deal.id, contactId: loose.id },
			],
		});
		const note = await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Call notes",
				companyId: from.id,
				dealId: deal.id,
				createdById: userId,
			},
			select: { id: true },
		});

		await deals.update(deal.id, { companyId: to.id });

		const people = await db.dealContact.findMany({
			where: { dealId: deal.id },
			select: { contactId: true },
		});
		expect(people.map((row) => row.contactId)).toEqual([staying.id]);

		const moved = await db.activity.findUniqueOrThrow({
			where: { id: note.id },
			select: { companyId: true },
		});
		expect(moved.companyId).toBe(to.id);

		await db.contact.delete({ where: { id: loose.id } });
	});
});

describe("creating a deal that is already lost", () => {
	it("refuses a losing stage without a reason", async () => {
		const owner = await company("lost");

		await expect(
			deals.create({
				name: `Lost ${suffix}`,
				companyId: owner.id,
				ownerId: userId,
				stage: DealStage.CLOSED_LOST,
			}),
		).rejects.toThrow(LOST_WITHOUT_REASON);

		expect(await db.deal.count({ where: { companyId: owner.id } })).toBe(0);
	});

	it("keeps the reason of a deal created as lost", async () => {
		const owner = await company("reason");

		const deal = await deals.create({
			name: `Lost with reason ${suffix}`,
			companyId: owner.id,
			ownerId: userId,
			stage: DealStage.CLOSED_LOST,
			closedReason: "  Went with a cheaper supplier  ",
		});

		const stored = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { closedReason: true, closedAt: true },
		});
		expect(stored.closedReason).toBe("Went with a cheaper supplier");
		expect(stored.closedAt).not.toBeNull();
	});
});

describe("an archived deal", () => {
	it("keeps its stage and emits nothing", async () => {
		const owner = await company("archived");
		const deal = await deals.create({
			name: `Archived ${suffix}`,
			companyId: owner.id,
			ownerId: userId,
		});
		await deals.archive(deal.id);
		events.length = 0;

		await expect(
			deals.setStage({ id: deal.id, stage: DealStage.CLOSED_WON }, userId),
		).rejects.toThrow(
			"That deal is archived. Restore it before you change its stage.",
		);

		const bulk = await deals.bulkSetStage(
			{ ids: [deal.id], stage: DealStage.CLOSED_WON },
			userId,
		);
		expect(bulk.succeeded).toBe(0);
		expect(bulk.failed).toBe(1);

		const stored = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { stage: true, closedAt: true },
		});
		expect(stored.stage).toBe(DealStage.DEMO_BOOKED);
		expect(stored.closedAt).toBeNull();
		expect(events).toEqual([]);
	});
});
