import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { AGENT_TASK_THREAD_ID_KEY } from "@crm/validation/agent-task-payload";
import { queueUnreadThreads } from "../agent/lib/housekeeping";

const suffix = `unread-${crypto.randomUUID().slice(0, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1_000;
const fixtureTasks: string[] = [];
const fixtureThreads: string[] = [];

async function unreadThreads(count: number): Promise<string[]> {
	const ids: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const now = new Date(Date.now() + DAY_MS + index);
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${suffix}-${index}`,
				subject: `Unread ${index}`,
				firstMessageAt: now,
				lastMessageAt: now,
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: `msg-${suffix}-${index}`,
						direction: "INBOUND",
						fromEmail: "preview@example.com",
						fromName: "Preview",
						recipients: [],
						sentAt: now,
					},
				},
			},
			select: { id: true },
		});
		ids.push(thread.id);
	}
	fixtureThreads.push(...ids);
	return ids;
}

async function openTask(threadId: string, dueAt: Date) {
	const task = await db.agentTask.create({
		data: {
			kind: "thread-insight",
			reason: `fixture ${suffix}`,
			dueAt,
			priority: PRIORITY.threadInsightBackfill,
			budget: 1,
			payload: { threadId, origin: "backfill" },
		},
		select: { id: true, dueAt: true },
	});
	fixtureTasks.push(task.id);
	return task;
}

function tasksOf(threadId: string) {
	return db.agentTask.findMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
		},
		select: { id: true },
	});
}

afterEach(async () => {
	const queued = await db.agentTask.findMany({
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
	fixtureTasks.length = 0;
	fixtureThreads.length = 0;
});

describe("queueUnreadThreads", () => {
	it("queues one task per unread thread and leaves an unrelated booking alone", async () => {
		const threads = await unreadThreads(3);
		const unrelated = await openTask(
			`unrelated-${suffix}`,
			new Date(Date.now() + DAY_MS),
		);

		await queueUnreadThreads();

		const queued = await Promise.all(threads.map(tasksOf));
		expect(queued.map((rows) => rows.length)).toEqual([1, 1, 1]);
		expect(new Set(queued.flat().map((row) => row.id)).size).toBe(3);

		const after = await db.agentTask.findUnique({
			where: { id: unrelated.id },
			select: { dueAt: true, finishedAt: true },
		});
		expect(after?.dueAt.getTime()).toBe(unrelated.dueAt.getTime());
		expect(after?.finishedAt).toBeNull();
	});

	it("queues no second task for a thread that already has one", async () => {
		const [thread] = await unreadThreads(1);
		if (!thread) throw new Error("No thread was created.");
		const existing = await openTask(thread, new Date());

		await queueUnreadThreads();

		const rows = await tasksOf(thread);
		expect(rows.map((row) => row.id)).toEqual([existing.id]);
	});
});
