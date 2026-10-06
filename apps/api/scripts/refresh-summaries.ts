import { cloud } from "@crm/db/cloud/scope";
import {
	readAgentLanguage,
	summaryLanguage,
} from "@crm/validation/agent-language";
import { AGENT_DISPATCH } from "../src/agent/agent-dispatch.config";
import {
	applySummaryCatchUp,
	planSummaryCatchUp,
	type SummaryVerdictCounts,
} from "../src/agent/summary-catch-up";

function describe(counts: SummaryVerdictCounts): string {
	return [
		`${counts.stale} written for another language`,
		`${counts.correct} already in the wanted language`,
		`${counts.foreign} detected in another language`,
		`${counts.mixed} detected as mixed`,
		`${counts.undetermined} undetermined`,
	].join(", ");
}

function mode(argv: readonly string[]): "dry-run" | "apply" {
	const apply = argv.includes("--apply");
	if (apply && argv.includes("--dry-run")) {
		throw new Error("Pass --dry-run or --apply, not both.");
	}
	return apply ? "apply" : "dry-run";
}

async function main(): Promise<void> {
	const { db } = await import("@crm/db");
	const { AgentTriggerService } = await import(
		"../src/agent/agent-trigger.service"
	);
	const run = mode(process.argv);
	const agent = new AgentTriggerService(db);

	const refreshHere = async () => {
		const workspace = cloud.scopeId() ?? "this install";
		const wanted = summaryLanguage(
			await readAgentLanguage(db),
			process.env.RELOOP_GERMAN,
		);
		const plan = await planSummaryCatchUp(db, wanted);

		console.log(`${workspace}: wanted language ${wanted}.`);
		console.log(`${workspace}: thread summaries: ${describe(plan.insights)}.`);
		console.log(`${workspace}: contact memories: ${describe(plan.memories)}.`);
		console.log(
			`${workspace}: ${plan.markThreads.length} thread summaries and ${plan.markContacts.length} contact memories get their language set without a rewrite. ${plan.refreshThreads.length} threads would be refreshed.`,
		);
		if (run === "dry-run") return plan.refreshThreads.length;

		const result = await applySummaryCatchUp(db, agent, plan);
		console.log(
			`${workspace}: set the language on ${result.markedInsights} thread summaries and ${result.markedMemories} contact memories. Queued ${result.queued} refreshes at the backfill priority.`,
		);
		return result.queued;
	};

	await cloud.forEachScope(refreshHere, {
		concurrency: 1,
		budgetMs: AGENT_DISPATCH.summaryRefresh.scriptBudgetMs,
	});

	if (run === "dry-run") {
		console.log("Dry run. Nothing was written. Run again with --apply.");
	}

	await db.$disconnect();
}

if (import.meta.main) await main();
