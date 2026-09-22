import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { DEMO_DATA } from "../src/demo/demo.config";
import { DemoService } from "../src/demo/demo.service";
import {
	DEMO,
	demoCounts,
	hasDemoData,
	hasRealData,
	removeDemoData,
	seedDemoData,
} from "../src/demo/demo-data";

const suffix = process.env.TEST_RUN_ID ?? "sample-data-spec";
const domain = `sample-${suffix}.example.com`;
const ownerId = `${suffix}-owner`;
const memberId = `${suffix}-member`;
const realCompanyId = `${suffix}-real-company`;

const service = new DemoService(db);
const trigger = new AgentTriggerService(db);
const sampleCompanyId = `${DEMO.prefix}co-${suffix}`;

const owner = {
	id: ownerId,
	name: "Sample Owner",
	email: `${ownerId}@${domain}`,
};

async function seedActor(id: string, role: string) {
	await db.user.create({
		data: {
			id,
			name: id,
			email: `${id}@${domain}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	await db.member.create({
		data: {
			id: `member-${id}`,
			organizationId: WORKSPACE_ID,
			userId: id,
			role,
			createdAt: new Date(),
		},
	});
}

async function clear() {
	await removeDemoData(db);
	await db.agentTask.deleteMany({
		where: { companyId: { in: [sampleCompanyId, realCompanyId] } },
	});
	await db.company.deleteMany({ where: { id: sampleCompanyId } });
	await db.company.deleteMany({ where: { id: realCompanyId } });
	await db.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});

	await clear();
	await seedActor(ownerId, "owner");
	await seedActor(memberId, "member");
});

afterAll(clear);

describe("the sample data", () => {
	it("seeds and removes in process, inside one transaction", async () => {
		expect(await hasDemoData(db)).toBe(false);

		const counts = await db.$transaction((tx) => seedDemoData(db, tx, owner), {
			timeout: DEMO_DATA.write.timeoutMs,
		});

		expect(counts.companies).toBeGreaterThan(20);
		expect(counts.contacts).toBeGreaterThan(30);
		expect(counts.deals).toBeGreaterThan(10);
		expect(counts.messages).toBeGreaterThan(80);
		expect(await hasDemoData(db)).toBe(true);
		expect(await service.status(ownerId)).toMatchObject({
			present: true,
			canManage: true,
			loadable: false,
		});

		const removed = await service.remove(ownerId);

		expect(removed.present).toBe(false);
		expect(removed.rows).toBeGreaterThan(counts.companies ?? 0);
		expect(await hasDemoData(db)).toBe(false);
		expect(Object.values(await demoCounts(db))).toEqual(
			Object.values(await demoCounts(db)).map(() => 0),
		);
	});

	it("refuses a member and leaves the CRM alone", async () => {
		expect(await service.status(memberId)).toMatchObject({
			canManage: false,
			loadable: false,
		});

		await expect(
			service.load({ ...owner, id: memberId }, "en"),
		).rejects.toThrow("Only an owner");
		await expect(service.remove(memberId)).rejects.toThrow("Only an owner");
		expect(await hasDemoData(db)).toBe(false);
	});

	it("refuses to load while the CRM holds records of its own", async () => {
		await db.company.create({
			data: { id: realCompanyId, name: "A real customer" },
		});

		expect(await hasRealData(db)).toBe(true);
		expect(await service.status(ownerId)).toMatchObject({ loadable: false });
		await expect(service.load(owner, "en")).rejects.toThrow(
			"only loads into an empty CRM",
		);
		expect(await hasDemoData(db)).toBe(false);

		await db.company.deleteMany({ where: { id: realCompanyId } });
	});

	it("queues no agent work on a sample record, and still queues on a real one", async () => {
		await db.company.create({
			data: { id: sampleCompanyId, name: "A sample customer" },
		});
		await db.company.create({
			data: { id: realCompanyId, name: "A real customer" },
		});

		await trigger.companyCreated(sampleCompanyId, "spec");
		await trigger.companyCreated(realCompanyId, "spec");

		expect(
			await db.agentTask.count({ where: { companyId: sampleCompanyId } }),
		).toBe(0);
		expect(
			await db.agentTask.count({ where: { companyId: realCompanyId } }),
		).toBeGreaterThan(0);

		await db.agentTask.deleteMany({
			where: { companyId: { in: [sampleCompanyId, realCompanyId] } },
		});
		await db.company.deleteMany({
			where: { id: { in: [sampleCompanyId, realCompanyId] } },
		});
	});

	it("refuses to load a second time while a load holds the lock", async () => {
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});

		const holder = db.$transaction(
			async (tx) => {
				await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${DEMO_DATA.lock.key}::bigint)`;
				await held;
			},
			{ timeout: DEMO_DATA.write.timeoutMs },
		);

		await expect(service.remove(ownerId)).rejects.toThrow(
			"being written already",
		);

		release();
		await holder;
	});

	it("names every row it writes with the demo prefix", async () => {
		await db.$transaction((tx) => seedDemoData(db, tx, owner), {
			timeout: DEMO_DATA.write.timeoutMs,
		});

		const strays = await db.company.count({
			where: {
				ownerId,
				id: { not: { startsWith: DEMO.prefix } },
			},
		});

		expect(strays).toBe(0);
		await expect(service.load(owner, "en")).rejects.toThrow("already loaded");

		await removeDemoData(db);
	});

	it("writes German copy for a German workspace", async () => {
		await db.$transaction((tx) => seedDemoData(db, tx, owner, "de"), {
			timeout: DEMO_DATA.write.timeoutMs,
		});

		const deal = await db.deal.findUniqueOrThrow({
			where: { id: `${DEMO.prefix}deal-5` },
			select: { name: true },
		});
		const contact = await db.contact.findUniqueOrThrow({
			where: { id: `${DEMO.prefix}ct-nordkap-1` },
			select: { title: true, company: { select: { industry: true } } },
		});
		const english = await db.emailMessage.count({
			where: {
				id: { startsWith: DEMO.prefix },
				OR: [
					{ body: { startsWith: "Hello " } },
					{ body: { startsWith: "Hi " } },
					{ subject: { startsWith: "Request for quotation" } },
				],
			},
		});
		const task = await db.activity.findFirstOrThrow({
			where: { id: `${DEMO.prefix}act-task-nordkap-1` },
			select: { subject: true },
		});

		expect(deal.name).toBe("Rahmenvertrag Wellpappkartons");
		expect(contact.title).toBe("Leitung Einkauf");
		expect(contact.company?.industry).toBe("Spedition");
		expect(task.subject).toBe("Q4-Preisliste an Henrik schicken");
		expect(english).toBe(0);

		await removeDemoData(db);
	});
});
