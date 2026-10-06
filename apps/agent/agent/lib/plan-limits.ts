import { db, type Prisma } from "@crm/db";
import {
	budgetTasksWhere,
	fixedAiFor,
	planIdOf,
	planLimitsOf,
	usageWindowOf,
} from "@crm/db/plan-usage";
import {
	DRAFT_KIND,
	INSIGHT_KIND,
	monthlyBudget,
	type PlanLimits,
	STORY_KIND,
} from "@crm/db/plans";

export function planId(): Promise<string | null> {
	return planIdOf(db);
}

export async function planLimits(): Promise<PlanLimits> {
	return planLimitsOf(db);
}

export async function fixedAi(): Promise<boolean> {
	try {
		return fixedAiFor(await planId());
	} catch {
		return false;
	}
}

export async function monthlyUsed(
	kind: string,
	now: Date = new Date(),
	exceptTaskId: string | null = null,
): Promise<number> {
	const { since } = await usageWindowOf(db, now);
	const where: Prisma.AgentTaskWhereInput = budgetTasksWhere(kind, since);
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

export function limitOutcome(kind: string, until: Date): string {
	const what =
		kind === INSIGHT_KIND || kind === STORY_KIND
			? "conversations"
			: kind === DRAFT_KIND
				? "drafts"
				: "research runs";
	return `The limit of your plan for ${what} is reached. This waits until ${until.toISOString().slice(0, 10)}. Upgrade your plan to continue now.`;
}

export async function limitResumesAt(now: Date = new Date()): Promise<Date> {
	return (await usageWindowOf(db, now)).until;
}
