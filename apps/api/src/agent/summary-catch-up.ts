import type { Db, Prisma } from "@crm/db";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import {
	CONVERSATION_LANGUAGE,
	type SummaryLanguage,
} from "@crm/validation/agent-language";
import { detectSummaryLanguage } from "@crm/validation/summary-language";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import type { AgentTriggerService } from "./agent-trigger.service";

export const SUMMARY_VERDICTS = [
	"stale",
	"correct",
	"foreign",
	"mixed",
	"undetermined",
] as const;

export type SummaryVerdict = (typeof SUMMARY_VERDICTS)[number];

export type SummaryVerdictCounts = Record<SummaryVerdict, number>;

export type SummaryCatchUpPlan = {
	wanted: SummaryLanguage;
	insights: SummaryVerdictCounts;
	memories: SummaryVerdictCounts;
	markThreads: string[];
	markContacts: string[];
	refreshThreads: string[];
};

export type SummaryCatchUpResult = {
	markedInsights: number;
	markedMemories: number;
	queued: number;
};

type SummaryRow = { id: string; language: string | null; summary: string };

const PAGE_SIZE = AGENT_DISPATCH.summaryRefresh.pageSize;

const QUEUES: ReadonlySet<SummaryVerdict> = new Set([
	"stale",
	"foreign",
	"mixed",
]);

export function summaryVerdict(
	row: Pick<SummaryRow, "language" | "summary">,
	wanted: SummaryLanguage,
): SummaryVerdict {
	if (row.language !== null) {
		return row.language === wanted ? "correct" : "stale";
	}
	if (wanted === CONVERSATION_LANGUAGE) return "undetermined";

	const detected = detectSummaryLanguage(row.summary);
	if (detected.kind === "mixed") return "mixed";
	if (detected.kind === "unknown") return "undetermined";

	return detected.language === wanted ? "correct" : "foreign";
}

function emptyCounts(): SummaryVerdictCounts {
	return { stale: 0, correct: 0, foreign: 0, mixed: 0, undetermined: 0 };
}

function staleWhere(wanted: SummaryLanguage) {
	return { OR: [{ language: null }, { language: { not: wanted } }] };
}

async function readInsights(
	db: Db,
	wanted: SummaryLanguage,
	after: string | null,
): Promise<SummaryRow[]> {
	const where: Prisma.ThreadInsightWhereInput = {
		...staleWhere(wanted),
		relevant: true,
		summary: { not: "" },
		AND: [
			{ NOT: { threadId: { startsWith: SAMPLE_DATA.prefix } } },
			after === null ? {} : { threadId: { gt: after } },
		],
	};
	const rows = await db.threadInsight.findMany({
		where,
		orderBy: { threadId: "asc" },
		take: PAGE_SIZE,
		select: { threadId: true, language: true, summary: true },
	});

	return rows.map((row) => ({ ...row, id: row.threadId }));
}

async function readMemories(
	db: Db,
	wanted: SummaryLanguage,
	after: string | null,
): Promise<SummaryRow[]> {
	const where: Prisma.ContactMemoryWhereInput = {
		...staleWhere(wanted),
		summary: { not: "" },
		AND: [
			{ NOT: { contactId: { startsWith: SAMPLE_DATA.prefix } } },
			after === null ? {} : { contactId: { gt: after } },
		],
	};
	const rows = await db.contactMemory.findMany({
		where,
		orderBy: { contactId: "asc" },
		take: PAGE_SIZE,
		select: { contactId: true, language: true, summary: true },
	});

	return rows.map((row) => ({ ...row, id: row.contactId }));
}

async function sortRows(
	read: (after: string | null) => Promise<SummaryRow[]>,
	wanted: SummaryLanguage,
): Promise<{
	counts: SummaryVerdictCounts;
	mark: string[];
	refresh: string[];
}> {
	const counts = emptyCounts();
	const mark: string[] = [];
	const refresh: string[] = [];
	let after: string | null = null;

	for (;;) {
		const rows = await read(after);
		for (const row of rows) {
			const verdict = summaryVerdict(row, wanted);
			counts[verdict] += 1;
			if (verdict === "correct") mark.push(row.id);
			if (QUEUES.has(verdict)) refresh.push(row.id);
		}
		if (rows.length < PAGE_SIZE) break;
		after = rows[rows.length - 1]?.id ?? null;
	}

	return { counts, mark, refresh };
}

async function newestRelevantThread(
	db: Db,
	contactId: string,
): Promise<string | null> {
	const thread = await db.emailThread.findFirst({
		where: { contactId, insight: { relevant: true } },
		orderBy: { lastMessageAt: "desc" },
		select: { id: true },
	});

	return thread?.id ?? null;
}

export async function planSummaryCatchUp(
	db: Db,
	wanted: SummaryLanguage,
): Promise<SummaryCatchUpPlan> {
	const insights = await sortRows(
		(after) => readInsights(db, wanted, after),
		wanted,
	);
	const memories = await sortRows(
		(after) => readMemories(db, wanted, after),
		wanted,
	);

	const refreshThreads = new Set(insights.refresh);
	for (const contactId of memories.refresh) {
		const threadId = await newestRelevantThread(db, contactId);
		if (threadId) refreshThreads.add(threadId);
	}

	return {
		wanted,
		insights: insights.counts,
		memories: memories.counts,
		markThreads: insights.mark,
		markContacts: memories.mark,
		refreshThreads: [...refreshThreads],
	};
}

function chunks<T>(items: readonly T[]): T[][] {
	const out: T[][] = [];
	for (let start = 0; start < items.length; start += PAGE_SIZE) {
		out.push(items.slice(start, start + PAGE_SIZE));
	}
	return out;
}

export async function applySummaryCatchUp(
	db: Db,
	agent: Pick<AgentTriggerService, "summaryRefreshRequested">,
	plan: SummaryCatchUpPlan,
): Promise<SummaryCatchUpResult> {
	let markedInsights = 0;
	for (const threadIds of chunks(plan.markThreads)) {
		const { count } = await db.threadInsight.updateMany({
			where: { threadId: { in: threadIds }, language: null },
			data: { language: plan.wanted },
		});
		markedInsights += count;
	}

	let markedMemories = 0;
	for (const contactIds of chunks(plan.markContacts)) {
		const { count } = await db.contactMemory.updateMany({
			where: { contactId: { in: contactIds }, language: null },
			data: { language: plan.wanted },
		});
		markedMemories += count;
	}

	let queued = 0;
	for (const threadId of plan.refreshThreads) {
		if (await agent.summaryRefreshRequested(threadId, "backfill")) queued += 1;
	}

	return { markedInsights, markedMemories, queued };
}
