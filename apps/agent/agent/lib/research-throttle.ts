import { db } from "@crm/db";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import { usageWindowOf } from "@crm/db/plan-usage";
import { clampResearchPerHour } from "@crm/db/plans";
import { AGENT_RESEARCH_PER_HOUR, readAgentProvider } from "@crm/db/settings";
import { DISPATCH } from "./dispatch-config";
import { modelUnavailable, providersExhausted } from "./model";
import { planLimits } from "./plan-limits";

export type ThrottleDecision = {
	allowed: number;
	reason: string | null;
};

export function researchSessionsBetween(
	since: Date,
	until: Date,
): Promise<number> {
	return db.agentTask.count({
		where: {
			kind: { notIn: [...DIRECT_KINDS] },
			startedAt: { gte: since, lte: until },
			attempts: { gte: 1 },
		},
	});
}

export function researchRunsInHour(now: Date): Promise<number> {
	return researchSessionsBetween(
		new Date(now.getTime() - DISPATCH.research.hourMs),
		now,
	);
}

export async function researchAllowance(
	batch: number,
	now = new Date(),
): Promise<ThrottleDecision> {
	const setting = await readAgentProvider(db);

	if (await providersExhausted()) {
		return {
			allowed: 0,
			reason:
				(await modelUnavailable()) ??
				"every configured model provider is at its usage limit",
		};
	}

	const limits = await planLimits();

	const perHour =
		clampResearchPerHour(setting.researchPerHour, limits) ??
		AGENT_RESEARCH_PER_HOUR.default;
	const started = await researchRunsInHour(now);

	const remaining = Math.max(0, perHour - started);
	if (remaining === 0) {
		return {
			allowed: 0,
			reason: `the research limit of ${perHour} sessions per hour is reached`,
		};
	}

	const perMonth = limits.researchSessionsPerMonth;
	if (perMonth === null) {
		return { allowed: Math.min(batch, remaining), reason: null };
	}

	const { since: windowStart } = await usageWindowOf(db, now);
	const startedThisMonth = await researchSessionsBetween(windowStart, now);
	const monthRemaining = Math.max(0, perMonth - startedThisMonth);
	if (monthRemaining === 0) {
		return {
			allowed: 0,
			reason: `the research limit of ${perMonth} sessions per month is reached`,
		};
	}

	return {
		allowed: Math.min(batch, remaining, monthRemaining),
		reason: null,
	};
}
