import { db } from "@crm/db";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import { clampResearchPerHour, limitsOf } from "@crm/db/plans";
import {
	AGENT_RESEARCH_PER_HOUR,
	readAgentProvider,
	readPlan,
} from "@crm/db/settings";
import { providersExhausted } from "./model";

const HOUR_MS = 3_600_000;

export type ThrottleDecision = {
	allowed: number;
	reason: string | null;
};

export async function researchAllowance(
	batch: number,
	now = new Date(),
): Promise<ThrottleDecision> {
	const setting = await readAgentProvider(db);

	if (await providersExhausted()) {
		return {
			allowed: 0,
			reason: "every configured model provider is at its usage limit",
		};
	}

	const limits = limitsOf(await readPlan(db));

	const perHour =
		clampResearchPerHour(setting.researchPerHour, limits) ??
		AGENT_RESEARCH_PER_HOUR.default;
	const since = new Date(now.getTime() - HOUR_MS);
	const started = await db.agentTask.count({
		where: {
			kind: { notIn: [...DIRECT_KINDS] },
			startedAt: { gte: since },
		},
	});

	const remaining = Math.max(0, perHour - started);
	if (remaining === 0) {
		return {
			allowed: 0,
			reason: `the research limit of ${perHour} sessions per hour is reached`,
		};
	}

	return { allowed: Math.min(batch, remaining), reason: null };
}
