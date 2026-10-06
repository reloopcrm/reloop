import { cloud } from "@crm/db/cloud/scope";
import { THREAD_CONTACTS } from "../src/mailbox/mailbox.config";

async function main(): Promise<void> {
	if (!process.argv.includes("--dry-run")) {
		console.error(
			"Only a dry run exists. The sync tick adds the contacts. Run again with --dry-run.",
		);
		process.exitCode = 1;
		return;
	}

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
	const { ThreadWriterService } = await import(
		"../src/mailbox/thread-writer.service"
	);
	const { ThreadContactsService } = await import(
		"../src/mailbox/thread-contacts.service"
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
	const threads = new ThreadWriterService(db, match, stamp, agent);
	const pass = new ThreadContactsService(db, match, threads, stamp);

	const previewHere = async () => {
		const workspace = cloud.scopeId() ?? "this install";
		const preview = await pass.preview();

		console.log(
			`${workspace}: ${preview.threads} relevant threads with a company or a contact.`,
		);
		console.log(`  threads skipped: ${formatCounts(preview.threadSkips)}`);
		console.log(`  inbound senders: ${formatCounts(preview.senders)}`);
		console.log(
			`  would create ${preview.senders.create} contacts at ${Object.keys(preview.createByDomain).length} domains.`,
		);
		for (const [domain, count] of Object.entries(preview.createByDomain).sort(
			(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
		)) {
			console.log(`    ${domain}: ${count}`);
		}
		console.log(
			`  active contacts: ${preview.activeContacts}, limit: ${preview.contactLimit ?? "none"}.`,
		);

		return preview.senders.create;
	};

	await cloud.forEachScope(previewHere, {
		concurrency: 1,
		budgetMs: THREAD_CONTACTS.previewBudgetMs,
	});

	console.log("Nothing was written. This was a dry run.");

	await db.$disconnect();
}

function formatCounts(counts: Record<string, number>): string {
	return Object.entries(counts)
		.map(([reason, count]) => `${reason} ${count}`)
		.join(", ");
}

if (import.meta.main) await main();
