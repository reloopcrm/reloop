import { db, type Prisma } from "@crm/db";
import { fixedAiFor, planIdOf } from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	INSIGHT_KIND,
	limitsOf,
	monthlyBudget,
	nextMonthStart,
	type PlanLimits,
	RESEARCH_RUN_KIND,
	startOfMonth,
} from "@crm/db/plans";

export function planId(): Promise<string | null> {
	return planIdOf(db);
}

export async function planLimits(): Promise<PlanLimits> {
	return limitsOf(await planId());
}

export async function fixedAi(): Promise<boolean> {
	try {
		return fixedAiFor(await planId());
	} catch {
		return false;
	}
}

const COUNTED_BY_FINISH = new Set([RESEARCH_RUN_KIND]);

export async function monthlyUsed(
	kind: string,
	now: Date = new Date(),
	exceptTaskId: string | null = null,
): Promise<number> {
	const since = startOfMonth(now);
	const where: Prisma.AgentTaskWhereInput = COUNTED_BY_FINISH.has(kind)
		? { kind, finishedAt: { gte: since } }
		: { kind, createdAt: { gte: since } };
	if (exceptTaskId) where.id = { not: exceptTaskId };

	return db.agentTask.count({ where });
}

export async function monthlyRoom(
	kind: string,
	now: Date = new Date(),
	exceptTaskId: string | null = null,
): Promise<number | null> {
	const budget = monthlyBudget(kind, await planLimits());
	if (budget === null) return null;

	return Math.max(0, budget - (await monthlyUsed(kind, now, exceptTaskId)));
}

export function limitOutcome(kind: string): string {
	const what =
		kind === INSIGHT_KIND
			? "conversations"
			: kind === DRAFT_KIND
				? "drafts"
				: "research runs";
	return `The monthly limit of your plan for ${what} is reached. This waits until next month. Upgrade your plan to continue now.`;
}

export function resumeNextMonth(now: Date = new Date()): Date {
	return nextMonthStart(now);
}
