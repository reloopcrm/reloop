import { cloud } from "@crm/db/cloud/scope";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import {
	readAgentLanguage,
	summaryLanguage,
} from "@crm/validation/agent-language";
import { AGENT_DISPATCH } from "../src/agent/agent-dispatch.config";

async function main(): Promise<void> {
	const { db } = await import("@crm/db");
	const { AgentTriggerService } = await import(
		"../src/agent/agent-trigger.service"
	);
	const apply = process.argv.includes("--apply");
	const agent = new AgentTriggerService(db);

	const refreshHere = async () => {
		const workspace = cloud.scopeId() ?? "this install";
		const wanted = summaryLanguage(
			await readAgentLanguage(db),
			process.env.RELOOP_GERMAN,
		);
		const stale = { OR: [{ language: null }, { language: { not: wanted } }] };

		const insights = await db.threadInsight.findMany({
			where: {
				...stale,
				relevant: true,
				summary: { not: "" },
				NOT: { threadId: { startsWith: SAMPLE_DATA.prefix } },
			},
			select: { threadId: true },
		});
		const memories = await db.contactMemory.findMany({
			where: {
				...stale,
				summary: { not: "" },
				NOT: { contactId: { startsWith: SAMPLE_DATA.prefix } },
			},
			select: { contactId: true },
		});

		const threadIds = new Set(insights.map((insight) => insight.threadId));
		for (const memory of memories) {
			const thread = await db.emailThread.findFirst({
				where: { contactId: memory.contactId, insight: { relevant: true } },
				orderBy: { lastMessageAt: "desc" },
				select: { id: true },
			});
			if (thread) threadIds.add(thread.id);
		}

		console.log(
			`${workspace}: wanted language ${wanted}. ${insights.length} thread summaries and ${memories.length} contact memories are in another language. ${threadIds.size} threads would be refreshed.`,
		);
		if (!apply) return threadIds.size;

		for (const threadId of threadIds) {
			await agent.summaryRefreshRequested(threadId, "backfill");
		}
		console.log(
			`${workspace}: queued ${threadIds.size} refreshes at the backfill priority.`,
		);
		return threadIds.size;
	};

	await cloud.forEachScope(refreshHere, {
		concurrency: 1,
		budgetMs: AGENT_DISPATCH.summaryRefresh.scriptBudgetMs,
	});

	if (!apply) {
		console.log("Nothing was queued. Run again with --apply to queue them.");
	}

	await db.$disconnect();
}

if (import.meta.main) await main();
