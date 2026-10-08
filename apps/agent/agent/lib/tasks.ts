import { db, Prisma } from "@crm/db";
import { MAX_ATTEMPTS, RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { isSampleRecordId, SAMPLE_ID_PATTERN } from "@crm/db/sample-data";
import {
	isTaskKindEnabled,
	readAgentFunctions,
} from "@crm/validation/agent-functions";
import { DISPATCH } from "./dispatch-config";

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	dealId: string | null;
	kind: string;
	reason: string;
	payload: Prisma.JsonValue | null;
	budget: number;
	attempts: number;
	priority: number;
	dueAt: Date;
};

export type TaskSubject = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	dealId: string | null;
	kind: string;
};

const LEASE_MS = DISPATCH.task.leaseMs;

export { DIRECT_KINDS, MAX_ATTEMPTS } from "@crm/db/agent-tasks";

export async function taskKindEnabled(kind: string): Promise<boolean> {
	try {
		return isTaskKindEnabled(await readAgentFunctions(db), kind);
	} catch (error) {
		console.error(
			`[agent] Could not read the function switches, so ${kind} stays on: ${error instanceof Error ? error.message : String(error)}`,
		);
		return true;
	}
}

export type PriorityBound = { above?: number; atMost?: number };

const PRIORITY_RANGE = { min: -2_147_483_648, max: 2_147_483_647 } as const;

export async function claimDue(
	limit: number,
	kinds: { only: readonly string[] } | { except: readonly string[] },
	leaseMs = LEASE_MS,
	priority: PriorityBound = {},
	filter: Prisma.Sql = Prisma.empty,
): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + leaseMs);
	const above = priority.above ?? PRIORITY_RANGE.min;
	const atMost = priority.atMost ?? PRIORITY_RANGE.max;

	if (limit <= 0) return [];
	const list = "only" in kinds ? [...kinds.only] : [...kinds.except];
	if ("only" in kinds && list.length === 0) return [];

	const onlyMode = "only" in kinds;

	const claimed = await db.$queryRaw<LeasedTask[]>`
		WITH due AS MATERIALIZED (
			SELECT t2.id FROM "agentTask" AS t2
			WHERE t2."finishedAt" IS NULL
				AND t2."dueAt" <= ${now}
				AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
				AND t2."attempts" < ${MAX_ATTEMPTS}
				AND t2."priority" > ${above}
				AND t2."priority" <= ${atMost}
				AND CASE
					WHEN ${onlyMode}::boolean THEN t2.kind = ANY(${list}::text[])
					ELSE t2.kind <> ALL(${list}::text[])
				END
				AND COALESCE(t2."contactId", '') NOT LIKE ${SAMPLE_ID_PATTERN}
				AND COALESCE(t2."companyId", '') NOT LIKE ${SAMPLE_ID_PATTERN}
				AND COALESCE(t2."dealId", '') NOT LIKE ${SAMPLE_ID_PATTERN}
				${filter}
			ORDER BY t2."priority" DESC, t2."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		)
		UPDATE "agentTask" AS t
		SET "leasedUntil" = ${until},
			"startedAt" = COALESCE(t."startedAt", ${now}),
			"attempts" = t."attempts" + 1
		FROM due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t."dealId", t.kind, t.reason, t.payload,
			t.budget, t.attempts, t.priority, t."dueAt";
	`;

	return claimed.sort(
		(a, b) => b.priority - a.priority || a.dueAt.getTime() - b.dueAt.getTime(),
	);
}

export async function retireExhausted(
	limit: number = DISPATCH.reconcile.retire,
): Promise<TaskSubject[]> {
	const now = new Date();

	return db.$queryRaw<TaskSubject[]>`
		WITH doomed AS MATERIALIZED (
			SELECT c.id
			FROM "agentTask" AS c
			WHERE c."finishedAt" IS NULL
				AND c."attempts" >= ${MAX_ATTEMPTS}
				AND (c."leasedUntil" IS NULL OR c."leasedUntil" < ${now})
			ORDER BY c."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		)
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${RETIRED_OUTCOME}
		FROM doomed
		WHERE t.id = doomed.id
		RETURNING t.id, t."contactId", t."companyId", t."dealId", t.kind;
	`;
}

export async function postponeTask(taskId: string, until: Date): Promise<void> {
	await db.$executeRaw`
		UPDATE "agentTask"
		SET "dueAt" = ${until}, "leasedUntil" = NULL, "attempts" = GREATEST("attempts" - 1, 0)
		WHERE id = ${taskId} AND "finishedAt" IS NULL
	`;
}

export async function returnClaim(taskId: string, until: Date): Promise<void> {
	await db.$executeRaw`
		UPDATE "agentTask"
		SET "dueAt" = ${until},
			"leasedUntil" = NULL,
			"startedAt" = CASE WHEN "attempts" <= 1 THEN NULL ELSE "startedAt" END,
			"attempts" = GREATEST("attempts" - 1, 0)
		WHERE id = ${taskId} AND "finishedAt" IS NULL
	`;
}

export async function completeTask(
	taskId: string,
	outcome: string,
	sessionId?: string,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			sessionId: sessionId || undefined,
		},
	});

	if (count === 0) return null;

	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			dealId: true,
			kind: true,
		},
	});
}

export async function closeUncounted(
	task: Pick<LeasedTask, "id" | "attempts">,
	outcome: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: { id: task.id, finishedAt: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			startedAt: task.attempts <= 1 ? null : undefined,
			attempts: { decrement: 1 },
		},
	});
}

export async function taskSubject(taskId: string): Promise<TaskSubject | null> {
	return db.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			dealId: true,
			kind: true,
		},
	});
}

export async function noteSession(
	taskId: string,
	sessionId: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: { sessionId },
	});
}

export async function scheduleTask(input: {
	contactId?: string | null;
	companyId?: string | null;
	dealId?: string | null;
	kind: string;
	reason: string;
	payload?: Prisma.InputJsonValue | null;
	dueAt: Date;
	priority?: number;
	budget?: number;
	subject?: { path: string[]; value: string };
}): Promise<{ id: string } | null> {
	if (
		isSampleRecordId(input.contactId) ||
		isSampleRecordId(input.companyId) ||
		isSampleRecordId(input.dealId)
	) {
		return null;
	}

	if (!(await taskKindEnabled(input.kind))) return null;

	return db.$transaction(async (tx) => {
		await lockIdempotencyKey(
			tx,
			`agent-task:${input.kind}:${input.contactId ?? ""}:${input.companyId ?? ""}:${input.subject?.value ?? ""}`,
		);

		const existing = await tx.agentTask.findFirst({
			where: {
				kind: input.kind,
				finishedAt: null,
				contactId: input.contactId ?? undefined,
				companyId: input.companyId ?? undefined,
				dealId: input.dealId ?? undefined,
				payload: input.subject
					? { path: input.subject.path, equals: input.subject.value }
					: undefined,
			},
			select: { id: true },
		});

		if (existing) {
			await tx.agentTask.update({
				where: { id: existing.id },
				data: { dueAt: input.dueAt, reason: input.reason },
			});
			return existing;
		}

		return tx.agentTask.create({
			data: {
				contactId: input.contactId ?? null,
				companyId: input.companyId ?? null,
				dealId: input.dealId ?? null,
				kind: input.kind,
				reason: input.reason,
				payload: input.payload ?? undefined,
				dueAt: input.dueAt,
				priority: input.priority ?? 0,
				budget: input.budget ?? 4,
			},
			select: { id: true },
		});
	});
}

export async function lastDecision(contactId: string) {
	return db.agentTask.findFirst({
		where: { contactId },
		orderBy: { createdAt: "desc" },
		select: {
			kind: true,
			reason: true,
			dueAt: true,
			finishedAt: true,
			outcome: true,
		},
	});
}

export type { Prisma };
