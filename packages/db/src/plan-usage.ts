import { DIRECT_KINDS } from "./agent-tasks";
import type { Db } from "./client";
import {
	type AddOnQuantities,
	DRAFT_KIND,
	INSIGHT_KIND,
	limitsOf,
	NO_ADD_ONS,
	type PlanLimits,
	RESEARCH_RUN_KIND,
	startOfMonth,
	withAddOns,
} from "./plans";
import { readPlan } from "./settings";
import { currentTenant, isHostedCustomer } from "./tenant-context";

export async function planIdOf(db: Db): Promise<string | null> {
	const stored = await readPlan(db);
	if (stored) return stored;
	return isHostedCustomer() ? currentTenant().plan : null;
}

export function fixedAiFor(plan: string | null | undefined): boolean {
	return isHostedCustomer() && limitsOf(plan).aiIncluded;
}

export function addOnsOf(): AddOnQuantities {
	return isHostedCustomer() ? currentTenant().billing.addOns : NO_ADD_ONS;
}

export async function planLimitsOf(db: Db): Promise<PlanLimits> {
	return withAddOns(limitsOf(await planIdOf(db)), addOnsOf());
}

export async function fixedAiWith(db: Db): Promise<boolean> {
	return fixedAiFor(await planIdOf(db));
}

export const USAGE_COUNTERS = [
	"insights",
	"drafts",
	"sessions",
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
	included: boolean;
	reached: boolean;
};

const LIMIT_OF = {
	insights: (limits: PlanLimits) => limits.insightsPerMonth,
	drafts: (limits: PlanLimits) => limits.draftsPerMonth,
	sessions: (limits: PlanLimits) => limits.researchSessionsPerMonth,
	research: (limits: PlanLimits) => limits.researchPerMonth,
	chat: (limits: PlanLimits) => limits.chatPerMonth,
	builder: (limits: PlanLimits) => limits.builderPerMonth,
} satisfies Record<UsageCounter, (limits: PlanLimits) => number | null>;

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
	const since = startOfMonth(now);
	const count = (kind: string) =>
		db.agentTask.count({ where: { kind, createdAt: { gte: since } } });

	const [insights, drafts, sessions, research, chat, builder] =
		await Promise.all([
			count(INSIGHT_KIND),
			count(DRAFT_KIND),
			db.agentTask.count({
				where: {
					kind: { notIn: [...DIRECT_KINDS] },
					startedAt: { gte: since },
				},
			}),
			db.agentTask.count({
				where: { kind: RESEARCH_RUN_KIND, finishedAt: { gte: since } },
			}),
			conversationMessages(db, "RECORD", since),
			conversationMessages(db, "BUILDER", since),
		]);

	return { insights, drafts, sessions, research, chat, builder };
}

export function limitOf(
	counter: UsageCounter,
	limits: PlanLimits,
): number | null {
	return LIMIT_OF[counter](limits);
}

export function includedIn(counter: UsageCounter, limits: PlanLimits): boolean {
	return counter === "research" ? limits.companyResearch : true;
}

export function usageLines(
	usage: MonthlyUsage,
	limits: PlanLimits,
): UsageLine[] {
	return USAGE_COUNTERS.map((counter) => {
		const limit = limitOf(counter, limits);
		const used = usage[counter];
		return {
			counter,
			used,
			limit,
			included: includedIn(counter, limits),
			reached: limit !== null && used >= limit,
		};
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
