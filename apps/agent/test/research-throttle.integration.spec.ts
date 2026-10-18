import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { researchRunsInHour } from "../agent/lib/research-throttle";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const reason = `research-throttle-${crypto.randomUUID()}`;

const now = new Date(
	Date.UTC(2200, 0, 1) + Math.floor(Math.random() * 100_000) * HOUR_MS,
);

type Started = {
	startedAt?: Date;
	attempts?: number;
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
			startedAt: shape.startedAt ?? new Date(now.getTime() - MINUTE_MS),
			attempts: shape.attempts ?? 1,
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
	it("counts every session that started in the hour, however it ended", async () => {
		await startedTasks(3, {
			attempts: MAX_ATTEMPTS,
			finishedAt: now,
			outcome: RETIRED_OUTCOME,
		});
		await startedTasks(3, {
			leasedUntil: new Date(now.getTime() - MINUTE_MS),
		});
		await startedTasks(3, {});

		expect(await researchRunsInHour(now)).toBe(9);
	});

	it("counts sessions that run or finished", async () => {
		await startedTasks(2, {
			leasedUntil: new Date(now.getTime() + MINUTE_MS),
		});
		await startedTasks(1, { finishedAt: now, outcome: "Done." });
		await startedTasks(1, { finishedAt: now });

		expect(await researchRunsInHour(now)).toBe(4);
	});

	it("keeps counting a session that outlives its lease", async () => {
		await startedTasks(1, {
			startedAt: new Date(now.getTime() - 50 * MINUTE_MS),
			leasedUntil: new Date(now.getTime() - 20 * MINUTE_MS),
		});

		expect(await researchRunsInHour(now)).toBe(1);
	});

	it("does not count a task that gave its only attempt back", async () => {
		await startedTasks(2, { attempts: 0 });

		expect(await researchRunsInHour(now)).toBe(0);
	});

	it("does not count sessions that started before the hour", async () => {
		await startedTasks(2, {
			startedAt: new Date(now.getTime() - HOUR_MS - MINUTE_MS),
			finishedAt: now,
		});

		expect(await researchRunsInHour(now)).toBe(0);
	});
});
