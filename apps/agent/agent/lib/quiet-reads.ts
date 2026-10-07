import { Prisma } from "@crm/db";
import { NOT_SAMPLE_RECORD } from "@crm/db/sample-data";
import { AGENT_TASK_THREAD_ID_KEY } from "@crm/validation/agent-task-payload";
import { DISPATCH } from "./dispatch-config";

export function quietSlots(size: number): number {
	if (size <= 0) return 0;
	return Math.min(size, Math.ceil(size * DISPATCH.read.quiet.share));
}

export function quietCutoff(now: Date = new Date()): Date {
	return new Date(now.getTime() - DISPATCH.read.quiet.afterMs);
}

export function unreadThreadsWhere(): Prisma.EmailThreadWhereInput {
	return { ...NOT_SAMPLE_RECORD, insight: null, messages: { some: {} } };
}

export function quietUnreadThreadsWhere(
	cutoff: Date,
): Prisma.EmailThreadWhereInput {
	return {
		...NOT_SAMPLE_RECORD,
		insight: null,
		lastMessageAt: { lte: cutoff },
		AND: [
			{ messages: { some: { direction: "INBOUND" } } },
			{ messages: { some: { direction: "OUTBOUND" } } },
		],
	};
}

export function quietThreadTaskFilter(cutoff: Date): Prisma.Sql {
	return Prisma.sql`
		AND EXISTS (
			SELECT 1 FROM "emailThread" AS th
			WHERE th.id = t2.payload->>${AGENT_TASK_THREAD_ID_KEY}
				AND th."lastMessageAt" <= ${cutoff}
				AND NOT EXISTS (
					SELECT 1 FROM "threadInsight" AS ti WHERE ti."threadId" = th.id
				)
				AND EXISTS (
					SELECT 1 FROM "emailMessage" AS mi
					WHERE mi."threadId" = th.id AND mi.direction = 'INBOUND'
				)
				AND EXISTS (
					SELECT 1 FROM "emailMessage" AS mo
					WHERE mo."threadId" = th.id AND mo.direction = 'OUTBOUND'
				)
		)
	`;
}
