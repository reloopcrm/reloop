import { db, Prisma } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { forwardReserve, INSIGHT_KIND } from "@crm/db/plans";
import {
	NOT_SAMPLE_RECORD,
	SAMPLE_DATA,
	SAMPLE_ID_PATTERN,
} from "@crm/db/sample-data";
import {
	AGENT_TASK_THREAD_ID_KEY,
	type AgentTaskThreadPayload,
	readAgentTaskThreadId,
} from "@crm/validation/agent-task-payload";
import { z } from "zod";
import { COPY } from "./copy";
import { DISPATCH } from "./dispatch-config";
import { IDENTIFY_KIND } from "./identify-precheck";
import { say } from "./language";
import { isDerivedName } from "./names";
import {
	limitOutcome,
	limitResumesAt,
	monthlyRoom,
	planLimits,
} from "./plan-limits";
import { playbookDue } from "./playbook";
import { closeUncounted, type LeasedTask, scheduleTask } from "./tasks";

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

export async function releaseArchivedClaims(
	tasks: readonly LeasedTask[],
): Promise<LeasedTask[]> {
	const idsOf = (pick: (task: LeasedTask) => string | null) => [
		...new Set(tasks.map(pick).filter((id): id is string => id !== null)),
	];
	const archived = { archivedAt: { not: null } };
	const [contacts, companies, deals] = await Promise.all([
		db.contact.findMany({
			where: { id: { in: idsOf((task) => task.contactId) }, ...archived },
			select: { id: true },
		}),
		db.company.findMany({
			where: { id: { in: idsOf((task) => task.companyId) }, ...archived },
			select: { id: true },
		}),
		db.deal.findMany({
			where: { id: { in: idsOf((task) => task.dealId) }, ...archived },
			select: { id: true },
		}),
	]);
	const gone = new Set(
		[...contacts, ...companies, ...deals].map((row) => row.id),
	);
	if (gone.size === 0) return [...tasks];

	const live: LeasedTask[] = [];
	for (const task of tasks) {
		const subjects = [task.contactId, task.companyId, task.dealId];
		if (subjects.some((id) => id !== null && gone.has(id))) {
			await closeUncounted(task, say(COPY.tasks.droppedArchived));
		} else {
			live.push(task);
		}
	}
	return live;
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
	const left = await monthlyRoom(INSIGHT_KIND);
	const room =
		left === null
			? null
			: Math.max(0, left - forwardReserve(INSIGHT_KIND, await planLimits()));
	if (room !== null && room <= 0) {
		if (left !== null && left > 0) {
			console.error(
				"[agent] backfill paused: the rest of the reading budget is kept for new mail",
			);
			return 0;
		}
		console.error(
			`[agent] reading waits: ${limitOutcome(INSIGHT_KIND, await limitResumesAt())}`,
		);
		return 0;
	}

	const threads = await db.emailThread.findMany({
		where: { ...NOT_SAMPLE_RECORD, insight: null, messages: { some: {} } },
		orderBy: { lastMessageAt: "desc" },
		take:
			room === null
				? DISPATCH.housekeeping.readBatch
				: Math.min(DISPATCH.housekeeping.readBatch, room),
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
			subject: { path: [AGENT_TASK_THREAD_ID_KEY], value: thread.id },
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
			take: DISPATCH.housekeeping.cleanBatch,
			select: { id: true },
		}),
		db.contact.findMany({
			where: {
				...readable,
				cleanedAt: { not: null },
				lastActivityAt: { gt: db.contact.fields.cleanedAt },
			},
			orderBy: { lastActivityAt: "desc" },
			take: DISPATCH.housekeeping.cleanBatch,
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

export async function queueIdentifyAgain(
	only?: readonly string[],
): Promise<number> {
	const rows = await db.$queryRaw<Array<{ id: string }>>`
		SELECT c.id
		FROM "contact" AS c
		JOIN LATERAL (
			SELECT t."finishedAt", t."startedAt"
			FROM "agentTask" AS t
			WHERE t."contactId" = c.id
				AND t.kind = ${IDENTIFY_KIND}
				AND t."finishedAt" IS NOT NULL
			ORDER BY t."finishedAt" DESC
			LIMIT 1
		) AS last ON true
		WHERE c."enrichmentStatus" = 'SKIPPED'
			AND c."archivedAt" IS NULL
			AND c.id NOT LIKE ${SAMPLE_ID_PATTERN}
			AND last."startedAt" IS NULL
			AND c."lastActivityAt" > last."finishedAt"
			${only ? Prisma.sql`AND c.id = ANY(${[...only]}::text[])` : Prisma.empty}
			AND NOT EXISTS (
				SELECT 1 FROM "agentTask" AS o
				WHERE o."contactId" = c.id
					AND o.kind = ${IDENTIFY_KIND}
					AND o."finishedAt" IS NULL
			)
		ORDER BY c."lastActivityAt" DESC
		LIMIT ${DISPATCH.research.precheck.againBatch}
	`;

	for (const row of rows) {
		await scheduleTask({
			contactId: row.id,
			kind: IDENTIFY_KIND,
			reason: "Active again since the pre-check skipped the research",
			dueAt: new Date(),
			priority: PRIORITY.identify,
			budget: 4,
		});
	}

	return rows.length;
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
	const eventCutoff = new Date(
		now.getTime() - days * DISPATCH.housekeeping.dayMs,
	);
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
