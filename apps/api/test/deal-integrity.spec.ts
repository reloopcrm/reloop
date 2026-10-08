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

describe("two moves of one deal at once", () => {
	it("leaves the activities at the company the deal ends at", async () => {
		const first = await company("first");
		const second = await company("second");
		const deal = await deals.create({
			name: `Racing ${suffix}`,
			companyId: first.id,
			ownerId: userId,
		});
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Race notes",
				companyId: first.id,
				dealId: deal.id,
				createdById: userId,
			},
		});

		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let locked = () => {};
		const lockTaken = new Promise<void>((resolve) => {
			locked = resolve;
		});
		const holder = db.$transaction(
			async (tx) => {
				await tx.$queryRaw`SELECT id FROM deal WHERE id = ${deal.id} FOR UPDATE`;
				locked();
				await held;
			},
			{ timeout: 10_000 },
		);
		await lockTaken;

		const away = deals.update(deal.id, { companyId: second.id });
		await Bun.sleep(300);
		const back = deals.update(deal.id, { companyId: first.id });
		await Bun.sleep(300);
		release();
		await holder;
		await Promise.all([away, back]);

		const stored = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { companyId: true },
		});
		const activities = await db.activity.findMany({
			where: { dealId: deal.id },
			select: { companyId: true },
		});
		expect(activities.map((row) => row.companyId)).toEqual([stored.companyId]);
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

describe("the old company's activity stamp after a move", () => {
	const older = new Date("2026-03-01T10:00:00.000Z");
	const moved = new Date("2026-03-05T10:00:00.000Z");
	const agentStamp = new Date("2026-03-09T10:00:00.000Z");

	async function movingDeal(key: string, stamp: Date) {
		const from = await company(`${key}-from`);
		const to = await company(`${key}-to`);
		const deal = await deals.create({
			name: `Stamp ${key} ${suffix}`,
			companyId: from.id,
			ownerId: userId,
		});
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Deal call",
				companyId: from.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: moved,
			},
		});
		await db.company.update({
			where: { id: from.id },
			data: { lastActivityAt: stamp },
		});
		return { from, to, deal };
	}

	async function stampOf(id: string) {
		const stored = await db.company.findUniqueOrThrow({
			where: { id },
			select: { lastActivityAt: true },
		});
		return stored.lastActivityAt;
	}

	it("drops to the newest activity the old company still has", async () => {
		const { from, to, deal } = await movingDeal("lower", moved);
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Company call",
				companyId: from.id,
				createdById: userId,
				createdAt: older,
			},
		});

		await deals.update(deal.id, { companyId: to.id });

		expect(await stampOf(from.id)).toEqual(older);
		expect(await stampOf(to.id)).toEqual(moved);
	});

	it("is empty when the old company has no activity left", async () => {
		const { from, to, deal } = await movingDeal("empty", moved);

		await deals.update(deal.id, { companyId: to.id });

		expect(await stampOf(from.id)).toBeNull();
	});

	it("keeps a newer stamp the agent wrote without a moved activity", async () => {
		const { from, to, deal } = await movingDeal("agent", agentStamp);

		await deals.update(deal.id, { companyId: to.id });

		expect(await stampOf(from.id)).toEqual(agentStamp);
		expect(await stampOf(to.id)).toEqual(moved);
	});
});

describe("two quick moves of one deal", () => {
	it("leaves no stamp at the company the deal left", async () => {
		const first = await company("quick-first");
		const second = await company("quick-second");
		const at = new Date("2026-04-02T10:00:00.000Z");

		let delayed = false;
		let started = () => {};
		const stampStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		class SlowStamp extends ActivityStampService {
			override async touch(
				...args: Parameters<ActivityStampService["touch"]>
			): Promise<void> {
				if (!delayed && args[0].companyId === second.id) {
					delayed = true;
					started();
					await Bun.sleep(400);
				}
				return super.touch(...args);
			}
		}
		const slow = new DealsService(
			db,
			agent,
			new SlowStamp(db),
			new ConversionService(db),
			new FieldsService(db, { fieldBackfill: async () => undefined } as never),
		);

		const deal = await deals.create({
			name: `Quick moves ${suffix}`,
			companyId: first.id,
			ownerId: userId,
		});
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Quick notes",
				companyId: first.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
			},
		});
		await db.company.update({
			where: { id: first.id },
			data: { lastActivityAt: at },
		});

		const away = slow.update(deal.id, { companyId: second.id });
		await stampStarted;
		const back = slow.update(deal.id, { companyId: first.id });
		await Promise.all([away, back]);

		const stamps = await db.company.findMany({
			where: { id: { in: [first.id, second.id] } },
			select: { id: true, lastActivityAt: true },
		});
		const stampOf = (id: string) =>
			stamps.find((row) => row.id === id)?.lastActivityAt;
		expect(stampOf(first.id)).toEqual(at);
		expect(stampOf(second.id)).toBeNull();
	});
});

describe("attaching a contact while the deal moves", () => {
	it("never leaves a contact of the old company on the deal", async () => {
		const from = await company("attach-from");
		const to = await company("attach-to");
		const leaving = await db.contact.create({
			data: { firstName: "Ari", lastName: "Attach", companyId: from.id },
			select: { id: true },
		});
		const deal = await deals.create({
			name: `Attach race ${suffix}`,
			companyId: from.id,
			ownerId: userId,
		});

		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let locked = () => {};
		const lockTaken = new Promise<void>((resolve) => {
			locked = resolve;
		});
		const holder = db.$transaction(
			async (tx) => {
				await tx.$queryRaw`SELECT id FROM deal WHERE id = ${deal.id} FOR UPDATE`;
				locked();
				await held;
			},
			{ timeout: 10_000 },
		);
		await lockTaken;

		const move = deals.update(deal.id, { companyId: to.id });
		await Bun.sleep(300);
		const attach = deals
			.attachContact({ dealId: deal.id, contactId: leaving.id })
			.then(
				() => null,
				(error: Error) => error,
			);
		await Bun.sleep(300);
		release();
		await holder;
		const [, refused] = await Promise.all([move, attach]);

		const people = await db.dealContact.findMany({
			where: { dealId: deal.id },
			select: { contactId: true },
		});
		expect(people).toEqual([]);
		expect(refused).toBeInstanceOf(Error);
		expect(refused?.message).toContain("does not work at");
	});
});
