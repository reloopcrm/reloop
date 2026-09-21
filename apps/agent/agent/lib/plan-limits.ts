import { db } from "@crm/db";
import {
	DRAFT_KIND,
	fixedAiFor,
	INSIGHT_KIND,
	limitsOf,
	monthlyBudget,
	monthStart,
	nextMonthStart,
	type PlanLimits,
	RESEARCH_RUN_KIND,
} from "@crm/db/plans";
import { readPlan } from "@crm/db/settings";
import { currentTenant, isHosted } from "@crm/db/tenant-context";

export async function planId(): Promise<string | null> {
	const stored = await readPlan(db);
	if (stored) return stored;
	return isHosted() ? currentTenant().plan : null;
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
	const since = monthStart(now);
	return db.agentTask.count({
		where: {
			kind,
			...(COUNTED_BY_FINISH.has(kind)
				? { finishedAt: { gte: since } }
				: { createdAt: { gte: since } }),
			...(exceptTaskId ? { id: { not: exceptTaskId } } : {}),
		},
	});
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
