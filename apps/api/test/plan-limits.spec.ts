import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GMAIL_SCOPE, GOOGLE_PROVIDER_ID } from "@crm/auth";
import { db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { budgetTasksWhere } from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	forwardReserve,
	INSIGHT_KIND,
	startOfMonth,
} from "@crm/db/plans";
import { readPlan, writePlan } from "@crm/db/settings";
import {
	actWithoutPlans,
	actWithTestPlans,
	TEST_PLANS,
	testPlans,
} from "@crm/db/test-plans";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import {
	countMailboxes,
	readCapacityUsage,
	SyncStateService,
} from "../src/mailbox/sync-state.service";
import { SettingsService } from "../src/settings/settings.service";

const suffix = process.env.TEST_RUN_ID ?? "plan-limits";
const email = `plan.limits.${suffix}@example.test`;
const reps = [`plan-rep-a-${suffix}`, `plan-rep-b-${suffix}`];
const padding = `plan.capacity.${suffix}`;

let contactId: string;
let planBefore: string | null;

const trigger = new AgentTriggerService(db);
const state = new SyncStateService(db);
const unused = undefined as never;
const settings = new SettingsService(db, unused, unused, unused);

async function clean(): Promise<void> {
	await db.agentTask.deleteMany({ where: { reason: { contains: suffix } } });
	await db.mailboxSync.deleteMany({ where: { userId: { in: reps } } });
	await db.user.deleteMany({ where: { id: { in: reps } } });
	await db.contact.deleteMany({ where: { email } });
	await db.contact.deleteMany({ where: { email: { startsWith: padding } } });
}

function actWithContactLimit(contacts: number): void {
	Object.assign(cloud, {
		plans: {
			...testPlans,
			limitsOf: () => ({ ...TEST_PLANS.wide, contacts }),
		},
	});
}

beforeAll(async () => {
	actWithTestPlans();
	planBefore = await readPlan(db);
	await clean();
	for (const id of reps) {
		await db.user.create({
			data: { id, name: "Plan rep", email: `${id}@example.test` },
		});
	}
	const contact = await db.contact.create({
		data: { firstName: "Plan", lastName: "Limit", email },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(async () => {
	await clean();
	await writePlan(db, planBefore);
	actWithoutPlans();
});

describe("plan limits in the API", () => {
	it("stops queueing email drafts once the month's budget is spent", async () => {
		await writePlan(db, "small");
		const budget = TEST_PLANS.small.draftsPerMonth;
		const used = await db.agentTask.count({
			where: budgetTasksWhere(DRAFT_KIND, startOfMonth()),
		});
		const remaining = Math.max(0, budget - used);

		await db.agentTask.createMany({
			data: Array.from({ length: remaining }, (_, index) => ({
				kind: DRAFT_KIND,
				reason: `spent ${suffix} ${index}`,
				priority: 0,
				budget: 1,
				dueAt: new Date(),
			})),
		});

		expect(await trigger.emailDraftRequested(contactId)).toBe(false);

		await writePlan(db, "keyless");
		expect(await trigger.emailDraftRequested(contactId)).toBe(true);
		await db.agentTask.deleteMany({
			where: { kind: DRAFT_KIND, contactId, finishedAt: null },
		});
	});

	it("keeps the reserved share of the reading budget for new mail", async () => {
		await writePlan(db, "wide");
		const budget = TEST_PLANS.wide.insightsPerMonth;
		const ceiling = budget - forwardReserve(INSIGHT_KIND, TEST_PLANS.wide);
		const used = await db.agentTask.count({
			where: budgetTasksWhere(INSIGHT_KIND, startOfMonth()),
		});
		expect(used).toBeLessThan(budget);

		await db.agentTask.createMany({
			data: Array.from({ length: Math.max(0, ceiling - used) }, (_, index) => ({
				kind: INSIGHT_KIND,
				reason: `reserve ${suffix} ${index}`,
				priority: 0,
				budget: 1,
				dueAt: new Date(),
				startedAt: new Date(),
				finishedAt: new Date(),
			})),
		});

		const count = () =>
			db.agentTask.count({
				where: { kind: INSIGHT_KIND, reason: { contains: `late ${suffix}` } },
			});

		await trigger.threadStored(
			`old-${suffix}`,
			`late ${suffix} old`,
			"backfill",
		);
		expect(await count()).toBe(0);

		await trigger.threadStored(
			`new-${suffix}`,
			`late ${suffix} new`,
			"forward",
		);
		expect(await count()).toBe(1);

		await writePlan(db, "keyless");
		await trigger.threadStored(
			`old-${suffix}`,
			`late ${suffix} old`,
			"backfill",
		);
		expect(await count()).toBe(2);
		await db.agentTask.deleteMany({
			where: { kind: INSIGHT_KIND, reason: { contains: suffix } },
		});
	});

	it("counts Google and Microsoft mailboxes against the mailbox limit", async () => {
		await writePlan(db, "small");
		const already = await db.mailboxSync.count({
			where: { source: { in: ["gmail", "outlook"] } },
		});
		const imap = await db.imapAccount.count();
		expect(already + imap).toBe(0);

		const gmail = await state.ensure(reps[0] ?? "", "gmail", {
			autoCreate: false,
		});
		expect(gmail).not.toBeNull();
		expect(await countMailboxes(db)).toBe(0);

		await db.account.create({
			data: {
				id: `plan-account-${suffix}`,
				accountId: `plan-account-${suffix}`,
				providerId: GOOGLE_PROVIDER_ID,
				userId: reps[0] ?? "",
				scope: GMAIL_SCOPE,
			},
		});
		expect(await countMailboxes(db)).toBe(1);

		const outlook = await state.ensure(reps[1] ?? "", "outlook", {
			autoCreate: false,
		});
		expect(outlook).toBeNull();
		expect((await state.mailboxLimitReached())?.label).toBe("Small");

		const calendar = await state.ensure(reps[1] ?? "", "calendar", {
			autoCreate: true,
		});
		expect(calendar).not.toBeNull();

		const again = await state.ensure(reps[0] ?? "", "gmail", {
			autoCreate: false,
		});
		expect(again?.id).toBe(gmail?.id);

		await writePlan(db, "wide");
		expect(await state.mailboxLimitReached()).toBeNull();
	});

	it("reports every limit and the usage behind it on the plan card", async () => {
		await writePlan(db, "small");
		const plan = await settings.plan();

		expect(plan.limits).toMatchObject({
			draftsPerMonth: TEST_PLANS.small.draftsPerMonth,
			storageGb: null,
			importThreads: TEST_PLANS.small.importThreads,
		});
		expect(plan.usage.contacts).toBeGreaterThan(0);
		expect(plan.usage.draftsThisMonth).toBeGreaterThanOrEqual(
			TEST_PLANS.small.draftsPerMonth,
		);
		expect(plan.usage.mailboxes).toBeGreaterThanOrEqual(0);
		expect(plan.usage.insightsThisMonth).toBeGreaterThanOrEqual(0);
	});

	it("rates the contact row against the limit the plans port gives", async () => {
		await writePlan(db, "wide");
		const counted = (await readCapacityUsage(db)).contacts;
		const missing = counted === 0 ? 4 : (4 - (counted % 4)) % 4;
		await db.contact.createMany({
			data: Array.from({ length: missing }, (_, index) => ({
				firstName: "Capacity",
				lastName: `${index}`,
				email: `${padding}.${index}@example.test`,
			})),
		});
		const used = (await readCapacityUsage(db)).contacts;
		expect(used % 4).toBe(0);

		const contactRow = async (limit: number) => {
			actWithContactLimit(limit);
			try {
				const usage = await settings.aiUsage();
				return usage.capacity.find((row) => row.counter === "contacts");
			} finally {
				actWithTestPlans();
			}
		};

		expect(await contactRow((used * 5) / 4 + 1)).toMatchObject({
			used,
			limit: (used * 5) / 4 + 1,
			level: "normal",
		});
		expect(await contactRow((used * 5) / 4)).toMatchObject({
			used,
			limit: (used * 5) / 4,
			level: "warning",
		});
		expect(await contactRow(used)).toMatchObject({
			used,
			limit: used,
			level: "reached",
		});

		actWithoutPlans();
		try {
			const selfHosted = await settings.aiUsage();
			expect(selfHosted.capacity.map((row) => row.level)).toEqual([
				"normal",
				"normal",
			]);
			expect(selfHosted.capacity.map((row) => row.limit)).toEqual([null, null]);
		} finally {
			actWithTestPlans();
		}
	});
});
