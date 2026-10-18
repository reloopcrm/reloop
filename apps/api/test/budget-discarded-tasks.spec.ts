import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { readMonthlyUsage } from "@crm/db/plan-usage";
import { DRAFT_KIND, RESEARCH_RUN_KIND } from "@crm/db/plans";

const reason = `budget-discarded-${crypto.randomUUID()}`;

function task(
	kind: string,
	state: { startedAt?: Date | null; finishedAt?: Date | null },
) {
	return db.agentTask.create({
		data: {
			kind,
			reason,
			priority: 0,
			budget: 1,
			dueAt: new Date(),
			startedAt: state.startedAt ?? null,
			finishedAt: state.finishedAt ?? null,
		},
	});
}

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { reason } });
});

describe("the monthly budget", () => {
	it("does not count a task that was closed before any work started", async () => {
		const before = await readMonthlyUsage(db);

		await task(DRAFT_KIND, { finishedAt: new Date() });
		await task(RESEARCH_RUN_KIND, { finishedAt: new Date() });

		const after = await readMonthlyUsage(db);
		expect(after.drafts).toBe(before.drafts);
		expect(after.research).toBe(before.research);
	});

	it("still counts a waiting task and a task that ran", async () => {
		const before = await readMonthlyUsage(db);

		await task(DRAFT_KIND, {});
		await task(DRAFT_KIND, { startedAt: new Date(), finishedAt: new Date() });
		await task(RESEARCH_RUN_KIND, {
			startedAt: new Date(),
			finishedAt: new Date(),
		});

		const after = await readMonthlyUsage(db);
		expect(after.drafts).toBe(before.drafts + 2);
		expect(after.research).toBe(before.research + 1);
	});
});
