import { SAMPLE_DATA } from "@crm/db/sample-data";
import {
	readAgentLanguage,
	summaryLanguage,
} from "@crm/validation/agent-language";

const REASON = "A summary was written in another language than the workspace's";

async function main(): Promise<void> {
	const { db } = await import("@crm/db");
	const { AgentTriggerService } = await import(
		"../src/agent/agent-trigger.service"
	);
	const apply = process.argv.includes("--apply");
	const wanted = summaryLanguage(
		await readAgentLanguage(db),
		process.env.RELOOP_GERMAN,
	);
	const stale = { OR: [{ language: null }, { language: { not: wanted } }] };

	const insights = await db.threadInsight.findMany({
		where: {
			...stale,
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
			where: { contactId: memory.contactId, insight: { isNot: null } },
			orderBy: { lastMessageAt: "desc" },
			select: { id: true },
		});
		if (thread) threadIds.add(thread.id);
	}

	console.log(
		`Wanted language: ${wanted}. ${insights.length} thread summaries and ${memories.length} contact memories are in another language. ${threadIds.size} threads would be read again.`,
	);

	if (apply) {
		const agent = new AgentTriggerService(db);
		for (const threadId of threadIds) {
			await agent.threadStored(threadId, REASON, "backfill", { reread: true });
		}
		console.log(`Queued ${threadIds.size} rereads at the backfill priority.`);
	} else {
		console.log("Nothing was queued. Run again with --apply to queue them.");
	}

	await db.$disconnect();
}

if (import.meta.main) await main();
