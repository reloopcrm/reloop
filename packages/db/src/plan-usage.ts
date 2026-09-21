import type { Db } from "./client";
import {
	DRAFT_KIND,
	fixedAiFor,
	INSIGHT_KIND,
	limitsOf,
	monthStart,
	type PlanLimits,
	RESEARCH_RUN_KIND,
} from "./plans";
import { readPlan } from "./settings";
import { currentTenant, isHosted } from "./tenant-context";

export async function planIdOf(db: Db): Promise<string | null> {
	const stored = await readPlan(db);
	if (stored) return stored;
	return isHosted() ? currentTenant().plan : null;
}

export async function planLimitsOf(db: Db): Promise<PlanLimits> {
	return limitsOf(await planIdOf(db));
}

export async function fixedAiWith(db: Db): Promise<boolean> {
	return fixedAiFor(await planIdOf(db));
}

export const USAGE_COUNTERS = [
	"insights",
	"drafts",
	"research",
	"chat",
	"builder",
] as const;

export type UsageCounter = (typeof USAGE_COUNTERS)[number];

export type MonthlyUsage = Record<UsageCounter, number>;

export type UsageLine = {
	counter: UsageCounter;
	used: number;
	limit: number | null;
	reached: boolean;
};

const LIMIT_OF: Record<UsageCounter, keyof PlanLimits> = {
	insights: "insightsPerMonth",
	drafts: "draftsPerMonth",
	research: "researchPerMonth",
	chat: "chatPerMonth",
	builder: "builderPerMonth",
};

export const USAGE_KIND: Record<
	Exclude<UsageCounter, "chat" | "builder">,
	string
> = {
	insights: INSIGHT_KIND,
	drafts: DRAFT_KIND,
	research: RESEARCH_RUN_KIND,
};

async function conversationMessages(
	db: Db,
	kind: "RECORD" | "BUILDER",
	since: Date,
): Promise<number> {
	const [row] = await db.$queryRaw<{ count: bigint }[]>`
		SELECT COUNT(*) AS count
		FROM "agentEvent" AS e
		JOIN "agentConversation" AS c ON c."sessionId" = e."sessionId"
		WHERE e.type = 'message.received'
			AND e."emittedAt" >= ${since}
			AND c.kind = ${kind}::"AgentConversationKind"
	`;

	return Number(row?.count ?? 0);
}

export async function readMonthlyUsage(
	db: Db,
	now: Date = new Date(),
): Promise<MonthlyUsage> {
	const since = monthStart(now);
	const count = (kind: string) =>
		db.agentTask.count({ where: { kind, createdAt: { gte: since } } });

	const [insights, drafts, research, chat, builder] = await Promise.all([
		count(INSIGHT_KIND),
		count(DRAFT_KIND),
		db.agentTask.count({
			where: { kind: RESEARCH_RUN_KIND, finishedAt: { gte: since } },
		}),
		conversationMessages(db, "RECORD", since),
		conversationMessages(db, "BUILDER", since),
	]);

	return { insights, drafts, research, chat, builder };
}

export function limitOf(
	counter: UsageCounter,
	limits: PlanLimits,
): number | null {
	const value = limits[LIMIT_OF[counter]];
	return typeof value === "number" ? value : null;
}

export function usageLines(
	usage: MonthlyUsage,
	limits: PlanLimits,
): UsageLine[] {
	return USAGE_COUNTERS.map((counter) => {
		const limit = limitOf(counter, limits);
		const used = usage[counter];
		return { counter, used, limit, reached: limit !== null && used >= limit };
	});
}

export function roomFor(
	counter: UsageCounter,
	usage: MonthlyUsage,
	limits: PlanLimits,
): number | null {
	const limit = limitOf(counter, limits);
	return limit === null ? null : Math.max(0, limit - usage[counter]);
}
