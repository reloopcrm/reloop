import { cloud } from "@crm/db/cloud/scope";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import { THREAD_PARTICIPANTS } from "../src/mailbox/mailbox.config";
import { closeDatabase } from "./close-database";

function flagValue(name: string): string | null {
	const at = process.argv.indexOf(name);
	if (at === -1) return null;
	return process.argv[at + 1] ?? null;
}

export async function main(): Promise<void> {
	const apply = process.argv.includes("--apply");
	const from = flagValue("--from");

	const { db } = await import("@crm/db");
	const { AgentTriggerService } = await import(
		"../src/agent/agent-trigger.service"
	);
	const { CompanyDirectoryService } = await import(
		"../src/companies/company-directory.service"
	);
	const { ActivityStampService } = await import(
		"../src/crm/activity-stamp.service"
	);
	const { EnrichmentLogService } = await import(
		"../src/crm/enrichment-log.service"
	);
	const { MailboxMatchService } = await import(
		"../src/mailbox/mailbox-match.service"
	);
	const { ThreadParticipantsService } = await import(
		"../src/mailbox/thread-participants.service"
	);

	const agent = new AgentTriggerService(db);
	const stamp = new ActivityStampService(db);
	const log = new EnrichmentLogService(db, stamp);
	const match = new MailboxMatchService(
		db,
		new CompanyDirectoryService(agent),
		agent,
		log,
	);
	const participants = new ThreadParticipantsService(db, match, stamp, agent);

	const runHere = async () => {
		const workspace = cloud.scopeId() ?? "this install";
		const result = await participants.backfill({ from, dryRun: !apply });
		const ids = [...result.contacts];
		let withoutOwnThread = 0;
		for (let start = 0; start < ids.length; start += 500) {
			withoutOwnThread += await db.contact.count({
				where: {
					id: { in: ids.slice(start, start + 500) },
					archivedAt: null,
					emailThreads: { none: {} },
				},
			});
		}

		console.log(
			`${workspace}: ${result.threads} threads scanned, ${result.linked} links in total.`,
		);
		console.log(
			`  ${apply ? "written" : "to write"}: ${result.written} links, ${result.removed} stale links ${apply ? "removed" : "to remove"}, ${result.slots} empty thread slots ${apply ? "filled" : "to fill"}.`,
		);
		console.log(
			`  ${ids.length} contacts take part in a thread, ${withoutOwnThread} of them own no thread.`,
		);
		if (!result.done) {
			console.log(
				`  stopped before the end. Continue with --from ${result.lastId ?? ""}.`,
			);
		}

		const memory = await contactsWithoutMemory(db);
		console.log(
			`  ${memory.contacts} active contacts with linked mail have no contact summary; ${memory.threads.size} conversations ${apply ? "queued" : "would be queued"} for a memory refresh.`,
		);
		if (apply) {
			let queued = 0;
			for (const threadId of memory.threads) {
				if (await agent.contactMemoryRequested(threadId)) queued += 1;
			}
			console.log(`  ${queued} memory refreshes queued.`);
		}

		return result.threads;
	};

	await cloud.forEachScope(runHere, {
		concurrency: 1,
		budgetMs: THREAD_PARTICIPANTS.scriptBudgetMs,
	});

	if (!apply) {
		console.log(
			"Nothing was written. Run again with --apply to link the mail.",
		);
	}

	await closeDatabase();
}

async function contactsWithoutMemory(
	db: typeof import("@crm/db")["db"],
): Promise<{ contacts: number; threads: Set<string> }> {
	const rows = await db.contact.findMany({
		where: {
			archivedAt: null,
			memory: null,
			id: { not: { startsWith: SAMPLE_DATA.prefix } },
			threadLinks: { some: { thread: { insight: { relevant: true } } } },
		},
		select: {
			threadLinks: {
				where: { thread: { insight: { relevant: true } } },
				orderBy: { lastAt: "desc" },
				take: 1,
				select: { threadId: true },
			},
		},
	});

	const threads = new Set<string>();
	for (const row of rows) {
		const link = row.threadLinks[0];
		if (link) threads.add(link.threadId);
	}

	return { contacts: rows.length, threads };
}

if (import.meta.main) await main();
