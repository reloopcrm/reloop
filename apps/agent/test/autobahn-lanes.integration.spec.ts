import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { readAgentTaskOrigin } from "@crm/validation/agent-task-payload";
import { runInsightLane } from "../agent/lib/dispatch";
import { currentLane, type Lane } from "../agent/lib/key-bucket";
import { completeTask, type LeasedTask } from "../agent/lib/tasks";

const runId = process.env.TEST_RUN_ID ?? "spec";
const reason = `autobahn-${runId}-${crypto.randomUUID().slice(0, 8)}`;
const created: string[] = [];

afterAll(async () => {
	for (const id of created) {
		await completeTask(id, "Closed by the autobahn lanes spec.");
	}
});

async function seed(origin: "forward" | "backfill", count: number) {
	const rows = await Promise.all(
		Array.from({ length: count }, (_, index) =>
			db.agentTask.create({
				data: {
					kind: "thread-insight",
					reason,
					dueAt: new Date(Date.now() - 10_000 - index),
					priority:
						origin === "backfill"
							? PRIORITY.threadInsightBackfill
							: PRIORITY.threadInsight,
					budget: 1,
					payload: { threadId: `thread-${reason}-${origin}-${index}`, origin },
				},
				select: { id: true },
			}),
		),
	);
	created.push(...rows.map((row) => row.id));
	return rows.map((row) => row.id);
}

function recorder() {
	const handled: { task: LeasedTask; lane: Lane }[] = [];
	const handle = async (task: LeasedTask) => {
		if (task.reason !== reason) {
			await completeTask(task.id, "Closed by the autobahn lanes spec.");
			return;
		}
		handled.push({ task, lane: currentLane() });
		await completeTask(task.id, "Read by the autobahn lanes spec.");
	};
	return { handled, handle };
}

async function open(ids: string[]) {
	return db.agentTask.findMany({
		where: { id: { in: ids }, finishedAt: null },
		select: { id: true, leasedUntil: true, attempts: true },
	});
}

describe("the fast lane and the slow lane", () => {
	it("reads today's mail before a queued backfill, and leaves the backfill untouched when the bucket is empty", async () => {
		const backfill = await seed("backfill", 3);
		const forward = await seed("forward", 1);
		const { handled, handle } = recorder();

		await runInsightLane(undefined, {
			room: async () => 0,
			handle,
			exhausted: async () => false,
		});

		const mine = handled.filter((entry) => entry.task.reason === reason);
		expect(mine.map((entry) => entry.task.id)).toEqual(forward);
		expect(mine[0]?.lane).toBe("fast");
		expect(readAgentTaskOrigin(mine[0]?.task.payload)).toBe("forward");

		const waiting = await open(backfill);
		expect(waiting).toHaveLength(3);
		expect(waiting.every((row) => row.leasedUntil === null)).toBe(true);
		expect(waiting.every((row) => row.attempts === 0)).toBe(true);
	});

	it("reads only as many backfill rows as the bucket allows, in the slow lane", async () => {
		await seed("backfill", 3);
		const before = await db.agentTask.count({
			where: { reason, finishedAt: null },
		});
		const { handled, handle } = recorder();
		let asked = 0;

		await runInsightLane(undefined, {
			room: async () => {
				asked += 1;
				return asked === 1 ? 2 : 0;
			},
			handle,
			exhausted: async () => false,
		});

		const mine = handled.filter((entry) => entry.task.reason === reason);
		if (mine.length !== 2) {
			console.error(
				JSON.stringify({
					asked,
					handled: handled.map((entry) => ({
						id: entry.task.id,
						reason: entry.task.reason,
						priority: entry.task.priority,
						attempts: entry.task.attempts,
						lane: entry.lane,
					})),
					rows: await db.agentTask.findMany({
						where: { reason },
						select: {
							id: true,
							priority: true,
							attempts: true,
							leasedUntil: true,
							finishedAt: true,
							outcome: true,
						},
					}),
				}),
			);
		}
		expect(mine).toHaveLength(2);
		expect(mine.every((entry) => entry.lane === "slow")).toBe(true);
		expect(
			mine.every(
				(entry) => readAgentTaskOrigin(entry.task.payload) === "backfill",
			),
		).toBe(true);
		expect(
			await db.agentTask.count({ where: { reason, finishedAt: null } }),
		).toBe(before - 2);
	});
});
