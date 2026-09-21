import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { DRAFT_KIND, PLANS, startOfMonth } from "@crm/db/plans";
import { readPlan, writePlan } from "@crm/db/settings";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { SettingsService } from "../src/settings/settings.service";

const suffix = process.env.TEST_RUN_ID ?? "plan-limits";
const email = `plan.limits.${suffix}@example.test`;
const reps = [`plan-rep-a-${suffix}`, `plan-rep-b-${suffix}`];

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
}

beforeAll(async () => {
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
});

describe("plan limits in the API", () => {
	it("stops queueing email drafts once the month's budget is spent", async () => {
		await writePlan(db, "trial");
		const budget = PLANS.trial.draftsPerMonth;
		const used = await db.agentTask.count({
			where: { kind: DRAFT_KIND, createdAt: { gte: startOfMonth() } },
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

		await writePlan(db, "hosting");
		expect(await trigger.emailDraftRequested(contactId)).toBe(true);
		await db.agentTask.deleteMany({
			where: { kind: DRAFT_KIND, contactId, finishedAt: null },
		});
	});

	it("counts Google and Microsoft mailboxes against the mailbox limit", async () => {
		await writePlan(db, "trial");
		const already = await db.mailboxSync.count({
			where: { source: { in: ["gmail", "outlook"] } },
		});
		const imap = await db.imapAccount.count();
		if (already + imap > 0) return;

		const gmail = await state.ensure(reps[0] ?? "", "gmail", {
			autoCreate: false,
		});
		expect(gmail).not.toBeNull();

		const outlook = await state.ensure(reps[1] ?? "", "outlook", {
			autoCreate: false,
		});
		expect(outlook).toBeNull();
		expect((await state.mailboxLimitReached())?.label).toBe("Trial");

		const calendar = await state.ensure(reps[1] ?? "", "calendar", {
			autoCreate: true,
		});
		expect(calendar).not.toBeNull();

		const again = await state.ensure(reps[0] ?? "", "gmail", {
			autoCreate: false,
		});
		expect(again?.id).toBe(gmail?.id);

		await writePlan(db, "plus");
		expect(await state.mailboxLimitReached()).toBeNull();
	});

	it("reports every limit and the usage behind it on the plan card", async () => {
		await writePlan(db, "trial");
		const plan = await settings.plan();

		expect(plan.limits).toMatchObject({
			draftsPerMonth: PLANS.trial.draftsPerMonth,
			storageGb: null,
			importThreads: PLANS.trial.importThreads,
		});
		expect(plan.usage.contacts).toBeGreaterThan(0);
		expect(plan.usage.draftsThisMonth).toBeGreaterThanOrEqual(
			PLANS.trial.draftsPerMonth,
		);
		expect(typeof plan.usage.mailboxes).toBe("number");
		expect(typeof plan.usage.insightsThisMonth).toBe("number");
	});
});
