import { db, Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { INSIGHT_KIND } from "@crm/db/plans";
import { NOT_SAMPLE_RECORD, SAMPLE_DATA } from "@crm/db/sample-data";
import {
	AGENT_TASK_THREAD_ID_KEY,
	type AgentTaskThreadPayload,
	readAgentTaskThreadId,
} from "@crm/validation/agent-task-payload";
import { z } from "zod";
import { COPY } from "./copy";
import { DISPATCH } from "./dispatch-config";
import { say } from "./language";
import { isDerivedName } from "./names";
import { limitOutcome, monthlyRoom } from "./plan-limits";
import { playbookDue } from "./playbook";
import { scheduleTask } from "./tasks";

const HOUSEKEEPING = {
	cleanBatch: 20,
	readBatch: 40,
} as const;

const DAY_MS = 24 * 60 * 60 * 1_000;

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
			outcome: say(COPY.tasks.droppedArchived),
		},
	});

	return gone.count;
}

export async function cancelSampleWork(): Promise<number> {
	const prefix = { startsWith: SAMPLE_DATA.prefix };

	const gone = await db.agentTask.updateMany({
		where: {
			finishedAt: null,
			OR: [{ contactId: prefix }, { companyId: prefix }, { dealId: prefix }],
		},
		data: {
			finishedAt: new Date(),
			outcome: say(COPY.tasks.droppedSample),
		},
	});

	return gone.count;
}

export async function queueUnreadThreads(): Promise<number> {
	const room = await monthlyRoom(INSIGHT_KIND);
	if (room !== null && room <= 0) {
		console.error(`[agent] reading waits: ${limitOutcome(INSIGHT_KIND)}`);
		return 0;
	}

	const threads = await db.emailThread.findMany({
		where: { ...NOT_SAMPLE_RECORD, insight: null, messages: { some: {} } },
		orderBy: { lastMessageAt: "desc" },
		take:
			room === null
				? HOUSEKEEPING.readBatch
				: Math.min(HOUSEKEEPING.readBatch, room),
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
			payload: {
				threadId: thread.id,
				origin: "backfill",
			} satisfies AgentTaskThreadPayload,
			dueAt: new Date(),
			priority: PRIORITY.threadInsightBackfill,
			budget: 1,
		});
		started += 1;
	}

	return started;
}

export async function queueContactCleanups(): Promise<number> {
	const readable = {
		...NOT_SAMPLE_RECORD,
		archivedAt: null,
		email: { not: null },
		emailThreads: { some: { messages: { some: { direction: "INBOUND" } } } },
	} satisfies Prisma.ContactWhereInput;

	const [never, since] = await Promise.all([
		db.contact.findMany({
			where: { ...readable, cleanedAt: null },
			orderBy: { createdAt: "desc" },
			take: HOUSEKEEPING.cleanBatch,
			select: { id: true },
		}),
		db.contact.findMany({
			where: {
				...readable,
				cleanedAt: { not: null },
				lastActivityAt: { gt: db.contact.fields.cleanedAt },
			},
			orderBy: { lastActivityAt: "desc" },
			take: HOUSEKEEPING.cleanBatch,
			select: { id: true, email: true, firstName: true, lastName: true },
		}),
	]);

	const again = since.filter((contact) =>
		isDerivedName(contact.email, contact.firstName, contact.lastName),
	);

	const settled = since
		.filter((contact) => !again.includes(contact))
		.map((contact) => contact.id);

	if (settled.length > 0) {
		await db.contact.updateMany({
			where: { id: { in: settled } },
			data: { cleanedAt: new Date() },
		});
	}

	const contacts = [...never, ...again];

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

export type HistoryPrune = { events: number; tasks: number };

const retentionDays = z.coerce.number().int().positive().catch(0);

export function historyRetentionDays(
	env: NodeJS.ProcessEnv = process.env,
): number {
	const raw = env[DISPATCH.retention.envVar]?.trim();
	return raw ? retentionDays.parse(raw) : 0;
}

export async function pruneAgentHistory(
	now = new Date(),
	days = historyRetentionDays(),
): Promise<HistoryPrune> {
	if (days <= 0) return { events: 0, tasks: 0 };

	const { batch } = DISPATCH.retention;
	const eventCutoff = new Date(now.getTime() - days * DAY_MS);
	const taskCutoff = eventCutoff;

	const events = await db.$executeRaw`
		DELETE FROM "agentEvent"
		WHERE id IN (
			SELECT id FROM "agentEvent"
			WHERE "emittedAt" < ${eventCutoff}
			LIMIT ${batch}
		)
	`;

	const tasks = await db.$executeRaw`
		DELETE FROM "agentTask"
		WHERE id IN (
			SELECT id FROM "agentTask"
			WHERE "finishedAt" IS NOT NULL AND "finishedAt" < ${taskCutoff}
			LIMIT ${batch}
		)
	`;

	return { events, tasks };
}
