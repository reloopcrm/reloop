import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { researchRunsInHour } from "../agent/lib/research-throttle";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const reason = `research-throttle-${crypto.randomUUID()}`;

const now = new Date(
	Date.UTC(2200, 0, 1) + Math.floor(Math.random() * 100_000) * HOUR_MS,
);

type Started = {
	finishedAt?: Date | null;
	leasedUntil?: Date | null;
	outcome?: string | null;
};

async function startedTasks(count: number, shape: Started): Promise<void> {
	await db.agentTask.createMany({
		data: Array.from({ length: count }, () => ({
			kind: "company-profile",
			reason,
			dueAt: new Date(now.getTime() - MINUTE_MS),
			startedAt: new Date(now.getTime() - MINUTE_MS),
			attempts: 1,
			finishedAt: shape.finishedAt ?? null,
			leasedUntil: shape.leasedUntil ?? null,
			outcome: shape.outcome ?? null,
		})),
	});
}

afterEach(async () => {
	await db.agentTask.deleteMany({ where: { reason } });
});

describe("the hourly research limit", () => {
	it("does not count starts that failed", async () => {
		await startedTasks(3, { finishedAt: now, outcome: RETIRED_OUTCOME });
		await startedTasks(3, {
			leasedUntil: new Date(now.getTime() - MINUTE_MS),
		});
		await startedTasks(3, {});

		expect(await researchRunsInHour(now)).toBe(0);
	});

	it("counts sessions that run or finished", async () => {
		await startedTasks(2, {
			leasedUntil: new Date(now.getTime() + MINUTE_MS),
		});
		await startedTasks(1, { finishedAt: now, outcome: "Done." });
		await startedTasks(1, { finishedAt: now });

		expect(await researchRunsInHour(now)).toBe(4);
	});
});
