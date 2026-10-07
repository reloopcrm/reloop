import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	AGENT_TASK_THREAD_ID_KEY,
	readAgentTaskThreadId,
} from "@crm/validation/agent-task-payload";
import { runInsightLane } from "../agent/lib/dispatch";
import { DISPATCH } from "../agent/lib/dispatch-config";
import { queueUnreadThreads } from "../agent/lib/housekeeping";
import { quietSlots } from "../agent/lib/quiet-reads";
import type { LeasedTask } from "../agent/lib/tasks";

const suffix = `quiet-${crypto.randomUUID().slice(0, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const fixtureThreads: string[] = [];
const fixtureTasks: string[] = [];
let sequence = 0;

type Direction = "INBOUND" | "OUTBOUND";

async function thread(at: Date, directions: Direction[]): Promise<string> {
	sequence += 1;
	const row = await db.emailThread.create({
		data: {
			rootMessageId: `root-${suffix}-${sequence}`,
			subject: `Quiet spec ${sequence}`,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: directions.length,
			messages: {
				create: directions.map((direction, index) => ({
					rfcMessageId: `msg-${suffix}-${sequence}-${index}`,
					direction,
					fromEmail:
						direction === "INBOUND"
							? "preview@example.com"
							: "sales@example.com",
					fromName: "Preview",
					recipients: [],
					sentAt: new Date(at.getTime() - index),
				})),
			},
		},
		select: { id: true },
	});
	fixtureThreads.push(row.id);
	return row.id;
}

async function activeThreads(count: number): Promise<string[]> {
	const ids: string[] = [];
	for (let index = 0; index < count; index += 1) {
		ids.push(
			await thread(new Date(Date.now() + 2 * DAY_MS + index), ["INBOUND"]),
		);
	}
	return ids;
}

async function quietThreads(count: number): Promise<string[]> {
	const ids: string[] = [];
	for (let index = 0; index < count; index += 1) {
		ids.push(
			await thread(
				new Date(
					Date.now() - DISPATCH.read.quiet.afterMs - HOUR_MS - index * HOUR_MS,
				),
				["INBOUND", "OUTBOUND"],
			),
		);
	}
	return ids;
}

async function queuedThreads(): Promise<Set<string>> {
	const rows = await db.agentTask.findMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			OR: fixtureThreads.map((threadId) => ({
				payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
			})),
		},
		select: { payload: true },
	});
	return new Set(
		rows
			.map((row) => readAgentTaskThreadId(row.payload))
			.filter((id): id is string => id !== null),
	);
}

async function waitingTask(threadId: string, dueAt: Date): Promise<string> {
	const task = await db.agentTask.create({
		data: {
			kind: "thread-insight",
			reason: `fixture ${suffix}`,
			dueAt,
			priority: PRIORITY.threadInsightBackfill,
			budget: 1,
			payload: { threadId, origin: "backfill" },
		},
		select: { id: true },
	});
	fixtureTasks.push(task.id);
	return task.id;
}

afterEach(async () => {
	const queued =
		fixtureThreads.length === 0
			? []
			: await db.agentTask.findMany({
					where: {
						kind: "thread-insight",
						OR: fixtureThreads.map((threadId) => ({
							payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
						})),
					},
					select: { id: true },
				});
	await db.agentTask.deleteMany({
		where: { id: { in: [...fixtureTasks, ...queued.map((task) => task.id)] } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { startsWith: `root-${suffix}` } },
	});
	fixtureThreads.length = 0;
	fixtureTasks.length = 0;
});

describe("quietSlots", () => {
	it("gives the configured share of a batch, and at least one slot to a batch of one", () => {
		expect(quietSlots(40)).toBe(Math.ceil(40 * DISPATCH.read.quiet.share));
		expect(quietSlots(1)).toBe(1);
		expect(quietSlots(0)).toBe(0);
	});
});

describe("queueUnreadThreads reads quiet customers beside the newest mail", () => {
	it("gives the configured share of the batch to quiet two-way threads", async () => {
		const active = await activeThreads(10);
		const quiet = await quietThreads(3);
		const oneWay = await thread(
			new Date(Date.now() - DISPATCH.read.quiet.afterMs - HOUR_MS),
			["INBOUND"],
		);
		const batch = 8;
		const slots = quietSlots(batch);

		const started = await queueUnreadThreads(batch);

		const queued = await queuedThreads();
		expect(started).toBe(batch);
		expect(queued.size).toBe(batch);
		expect(quiet.filter((id) => queued.has(id))).toEqual(quiet.slice(0, slots));
		expect(active.filter((id) => queued.has(id))).toHaveLength(batch - slots);
		expect(queued.has(oneWay)).toBe(false);
	});

	it("fills the batch with the newest threads when there are fewer quiet ones", async () => {
		const active = await activeThreads(10);
		const quiet = await quietThreads(1);
		const batch = 8;

		const started = await queueUnreadThreads(batch);

		const queued = await queuedThreads();
		expect(quietSlots(batch)).toBeGreaterThan(quiet.length);
		expect(started).toBe(batch);
		expect(queued.size).toBe(batch);
		expect(quiet.every((id) => queued.has(id))).toBe(true);
		expect(active.filter((id) => queued.has(id))).toHaveLength(
			batch - quiet.length,
		);
	});

	it("queues no second task for a quiet thread that already waits", async () => {
		await activeThreads(2);
		const [quiet] = await quietThreads(1);
		if (!quiet) throw new Error("No quiet thread was created.");
		const existing = await waitingTask(quiet, new Date());

		await queueUnreadThreads(4);

		const rows = await db.agentTask.findMany({
			where: {
				kind: "thread-insight",
				finishedAt: null,
				payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: quiet },
			},
			select: { id: true },
		});
		expect(rows.map((row) => row.id)).toEqual([existing]);
	});
});

describe("the slow lane reads quiet customers beside the oldest queued mail", () => {
	it("claims the configured share of every slow batch for quiet two-way threads", async () => {
		const active = await activeThreads(10);
		const quiet = await quietThreads(3);
		const activeTasks = await Promise.all(
			active.map((id, index) =>
				waitingTask(id, new Date(Date.now() - 365 * DAY_MS - index)),
			),
		);
		const quietTasks = await Promise.all(
			quiet.map((id) => waitingTask(id, new Date(Date.now() - 1_000))),
		);
		const mine = new Set([...activeTasks, ...quietTasks]);
		const claimed: LeasedTask[] = [];
		const room = 4;
		let asked = 0;

		await runInsightLane(undefined, {
			room: async () => {
				asked += 1;
				return asked === 1 ? room : 0;
			},
			handle: async (task) => {
				if (mine.has(task.id)) claimed.push(task);
			},
			exhausted: async () => false,
		});

		const ids = claimed.map((task) => task.id);
		expect(ids).toHaveLength(room);
		expect(ids.filter((id) => quietTasks.includes(id))).toHaveLength(
			quietSlots(room),
		);
		expect(ids.filter((id) => activeTasks.includes(id))).toHaveLength(
			room - quietSlots(room),
		);
	});

	it("gives the whole slow batch to the oldest queued mail when no quiet thread waits", async () => {
		const active = await activeThreads(6);
		const activeTasks = await Promise.all(
			active.map((id, index) =>
				waitingTask(id, new Date(Date.now() - 365 * DAY_MS - index)),
			),
		);
		const mine = new Set(activeTasks);
		const claimed: string[] = [];
		const room = 4;
		let asked = 0;

		await runInsightLane(undefined, {
			room: async () => {
				asked += 1;
				return asked === 1 ? room : 0;
			},
			handle: async (task) => {
				if (mine.has(task.id)) claimed.push(task.id);
			},
			exhausted: async () => false,
		});

		expect(claimed).toHaveLength(room);
	});
});
