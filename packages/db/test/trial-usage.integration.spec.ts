import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, disconnectAll } from "../src/client";
import { readMonthlyUsage } from "../src/plan-usage";
import { DRAFT_KIND } from "../src/plans";
import { readPlan, writePlan } from "../src/settings";
import { closeRegistry, type Tenant } from "../src/tenancy";
import { runAsTenant } from "../src/tenant-context";
import { PREPARE_TIMEOUT_MS, prepareTestTenants } from "../src/test-tenants";

const reason = `trialwin-${crypto.randomUUID().slice(0, 8)}`;
const TRIAL_ENDS_AT = new Date("2026-11-11T09:00:00.000Z");
const NOW = new Date("2026-11-02T12:00:00.000Z");
const DRAFTS_AT = [
	"2026-10-27T12:00:00.000Z",
	"2026-10-28T12:00:00.000Z",
	"2026-10-29T12:00:00.000Z",
	"2026-10-30T12:00:00.000Z",
	"2026-10-31T12:00:00.000Z",
];

const saved = {
	registry: process.env.RELOOP_REGISTRY_URL,
	template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
};
let trial: Tenant;
let planBefore: string | null = null;
let planChanged = false;

const inTrial = <T>(fn: () => Promise<T>) => runAsTenant(trial, fn);

beforeAll(async () => {
	const { a } = await prepareTestTenants();
	trial = { ...a, plan: "trial", trialEndsAt: TRIAL_ENDS_AT };
	await inTrial(async () => {
		await db.agentTask.deleteMany({ where: { reason } });
		planBefore = await readPlan(db);
		if (planBefore !== null && planBefore !== "trial") {
			await writePlan(db, "trial");
			planChanged = true;
		}
	});
}, PREPARE_TIMEOUT_MS);

afterAll(async () => {
	await inTrial(async () => {
		await db.agentTask.deleteMany({ where: { reason } });
		if (planChanged) await writePlan(db, planBefore);
	});
	await disconnectAll();
	await closeRegistry();
	if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
	else process.env.RELOOP_REGISTRY_URL = saved.registry;
	if (saved.template === undefined)
		delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
	else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
});

describe("the trial's usage in a tenant database", () => {
	it("still counts the drafts of the 28th to the 31st on the 2nd of the next month", () =>
		inTrial(async () => {
			const before = (await readMonthlyUsage(db, NOW)).drafts;

			await db.agentTask.createMany({
				data: DRAFTS_AT.map((at) => ({
					kind: DRAFT_KIND,
					reason,
					dueAt: new Date(at),
					createdAt: new Date(at),
				})),
			});

			const after = (await readMonthlyUsage(db, NOW)).drafts;
			expect(after - before).toBe(4);
		}));
});
