import { db, Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	AGENT_TASK_THREAD_ID_KEY,
	type AgentTaskThreadPayload,
	readAgentTaskThreadId,
} from "@crm/validation/agent-task-payload";
import { playbookDue } from "./playbook";
import { scheduleTask } from "./tasks";

const HOUSEKEEPING = {
	cleanBatch: 20,
	readBatch: 40,
} as const;

export async function cancelArchivedWork(): Promise<number> {
	const [contacts, companies, deals] = await Promise.all([
		db.contact.findMany({
			where: { archivedAt: { not: null } },
			select: { id: true },
		}),
		db.company.findMany({
			where: { archivedAt: { not: null } },
			select: { id: true },
		}),
		db.deal.findMany({
			where: { archivedAt: { not: null } },
			select: { id: true },
		}),
	]);

	const gone = await db.agentTask.updateMany({
		where: {
			finishedAt: null,
			OR: [
				{ contactId: { in: contacts.map((row) => row.id) } },
				{ companyId: { in: companies.map((row) => row.id) } },
				{ dealId: { in: deals.map((row) => row.id) } },
			],
		},
		data: {
			finishedAt: new Date(),
			outcome: "Dropped: the record was archived before the work started.",
		},
	});

	return gone.count;
}

export async function queueUnreadThreads(): Promise<number> {
	const threads = await db.emailThread.findMany({
		where: { insight: null, messages: { some: {} } },
		orderBy: { lastMessageAt: "desc" },
		take: HOUSEKEEPING.readBatch,
		select: { id: true },
	});

	if (threads.length === 0) return 0;

	const queued = await db.agentTask.findMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], not: Prisma.DbNull },
		},
		select: { payload: true },
	});

	const busy = new Set(
		queued
			.map((task) => readAgentTaskThreadId(task.payload))
			.filter((id): id is string => id !== null),
	);

	let started = 0;

	for (const thread of threads) {
		if (busy.has(thread.id)) continue;

		await scheduleTask({
			kind: "thread-insight",
			reason: "Read a conversation that never came back",
			payload: { threadId: thread.id } satisfies AgentTaskThreadPayload,
			dueAt: new Date(),
			priority: PRIORITY.threadInsight,
			budget: 1,
		});
		started += 1;
	}

	return started;
}

export async function queueContactCleanups(): Promise<number> {
	const contacts = await db.contact.findMany({
		where: {
			cleanedAt: null,
			archivedAt: null,
			email: { not: null },
			emailThreads: { some: { messages: { some: { direction: "INBOUND" } } } },
		},
		orderBy: { createdAt: "desc" },
		take: HOUSEKEEPING.cleanBatch,
		select: { id: true },
	});

	for (const contact of contacts) {
		await scheduleTask({
			contactId: contact.id,
			kind: "contact-clean",
			reason: "Read their signature for the real name",
			dueAt: new Date(),
			priority: PRIORITY.contactClean,
			budget: 1,
		});
	}

	return contacts.length;
}

export async function queuePlaybookLearn(): Promise<boolean> {
	if (!(await playbookDue())) return false;

	await scheduleTask({
		kind: "playbook-learn",
		reason: "Learn from the rep's sent emails",
		payload: { scope: "playbook" },
		dueAt: new Date(),
		priority: PRIORITY.playbookLearn,
		budget: 1,
	});

	return true;
}
