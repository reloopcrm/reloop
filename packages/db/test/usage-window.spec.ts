import { afterEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import { readMonthlyUsage, usageWindowOf } from "../src/plan-usage";
import { NO_BILLING, type Tenant } from "../src/tenancy";
import { runAsTenant } from "../src/tenant-context";

const saved = process.env.RELOOP_REGISTRY_URL;

const TRIAL_START = new Date("2026-10-28T09:00:00.000Z");
const TRIAL_END = new Date("2026-11-11T09:00:00.000Z");
const NOW = new Date("2026-11-02T12:00:00.000Z");
const MONTH_START = "2026-11-01T00:00:00.000Z";
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

const tenantOn = (plan: string): Tenant => ({
	id: "trialwin-acme",
	slug: "trialwin-acme",
	dbName: "trialwin_acme_test",
	plan,
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: TRIAL_START,
	trialEndsAt: plan === "trial" ? TRIAL_END : null,
	suspendedAt: null,
	deletedAt: null,
	allowList: ["trialwin-acme.example"],
	paidUntil: null,
	graceUntil: null,
	billing: NO_BILLING,
});

function recordingDb(stored: string | null) {
	const since: Date[] = [];
	const fake = {
		appSetting: { findUnique: async () => ({ plan: stored }) },
		agentTask: {
			count: async ({ where }: { where: Record<string, { gte: Date }> }) => {
				const bound = where.createdAt ?? where.startedAt ?? where.finishedAt;
				if (bound) since.push(bound.gte);
				return 0;
			},
		},
		$queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
			since.push(values[0] as Date);
			return [{ count: 0n }];
		},
	};
	return { db: fake as unknown as Db, since };
}

const distinct = (dates: Date[]) => [
	...new Set(dates.map((date) => date.toISOString())),
];

afterEach(() => {
	if (saved === undefined) delete process.env.RELOOP_REGISTRY_URL;
	else process.env.RELOOP_REGISTRY_URL = saved;
});

describe("the usage window", () => {
	it("counts a hosted trial from the day it started, across the first of the month", async () => {
		process.env.RELOOP_REGISTRY_URL = "postgresql://registry.test/registry";
		const { db, since } = recordingDb(null);

		const window = await runAsTenant(tenantOn("trial"), () =>
			usageWindowOf(db, NOW),
		);
		expect(window.since.toISOString()).toBe(TRIAL_START.toISOString());
		expect(window.until.toISOString()).toBe(TRIAL_END.toISOString());

		await runAsTenant(tenantOn("trial"), () => readMonthlyUsage(db, NOW));
		expect(distinct(since)).toEqual([TRIAL_START.toISOString()]);
	});

	it("keeps counting from the trial start and resumes in the future once the trial is over", async () => {
		process.env.RELOOP_REGISTRY_URL = "postgresql://registry.test/registry";
		const { db } = recordingDb(null);
		const later = new Date("2026-11-12T12:00:00.000Z");

		const window = await runAsTenant(tenantOn("trial"), () =>
			usageWindowOf(db, later),
		);
		expect(window.since.toISOString()).toBe(TRIAL_START.toISOString());
		expect(window.until.toISOString()).toBe(NEXT_MONTH);
	});

	it("keeps the calendar month for a hosted paid plan", async () => {
		process.env.RELOOP_REGISTRY_URL = "postgresql://registry.test/registry";
		const { db, since } = recordingDb("start");

		const window = await runAsTenant(tenantOn("start"), () =>
			usageWindowOf(db, NOW),
		);
		expect(window.since.toISOString()).toBe(MONTH_START);
		expect(window.until.toISOString()).toBe(NEXT_MONTH);

		await runAsTenant(tenantOn("start"), () => readMonthlyUsage(db, NOW));
		expect(distinct(since)).toEqual([MONTH_START]);
	});

	it("keeps the calendar month on a self-hosted install, outside any tenant", async () => {
		delete process.env.RELOOP_REGISTRY_URL;
		const { db, since } = recordingDb("trial");

		const window = await usageWindowOf(db, NOW);
		expect(window.since.toISOString()).toBe(MONTH_START);
		expect(window.until.toISOString()).toBe(NEXT_MONTH);

		await readMonthlyUsage(db, NOW);
		expect(distinct(since)).toEqual([MONTH_START]);
	});
});
