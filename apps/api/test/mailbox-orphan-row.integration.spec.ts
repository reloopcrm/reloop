import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, GoogleSyncStatus } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { GoogleConnectionService } from "../src/google/google-connection.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import {
	countMailboxes,
	SyncStateService,
} from "../src/mailbox/sync-state.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import type { GraphClient } from "../src/microsoft/graph.client";
import { MicrosoftConnectionService } from "../src/microsoft/microsoft-connection.service";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

const suffix = process.env.TEST_RUN_ID ?? "orphan-row-spec";
const userId = `orphan-${suffix}`;

const agent = {} as AgentTriggerService;
const stamp = new ActivityStampService(db);
const tokens = new MailboxTokenService(db);
const state = new SyncStateService(db);
const match = new MailboxMatchService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	new EnrichmentLogService(db, stamp),
);
const microsoft = new MicrosoftConnectionService(db, tokens, state, stamp);
const google = new GoogleConnectionService(db, tokens, state, match, stamp);
const outlook = new OutlookSyncService(
	db,
	{} as GraphClient,
	tokens,
	state,
	{} as ThreadWriterService,
);

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeEach(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Orphan", email: `${userId}@example.com` },
	});
});

afterAll(clean);

describe("a mailbox row whose OAuth never finished", () => {
	it("goes back to idle after a skipped tick", async () => {
		await microsoft.setImportSince(userId, null);
		const row = await state.get(userId, "outlook");
		if (!row) throw new Error("setImportSince stored no row");

		expect(await state.claim(row, new Date())).toBe(true);
		const outcome = await outlook.sync(row);
		expect(outcome.status).toBe("skipped");

		await state.release(row.id);

		const after = await state.get(userId, "outlook");
		expect(after?.status).toBe(GoogleSyncStatus.IDLE);
		expect(after?.retryAfter).toBeNull();
	});

	it("keeps a status the run wrote itself", async () => {
		const row = await state.ensure(userId, "outlook", { autoCreate: false });
		if (!row) throw new Error("ensure stored no row");
		await state.markFailed(row.id, "Graph failed.");

		await state.release(row.id);

		expect((await state.get(userId, "outlook"))?.status).toBe(
			GoogleSyncStatus.FAILED,
		);
	});

	it("does not count toward the mailbox limit", async () => {
		const before = await countMailboxes(db);
		await microsoft.setImportSince(userId, null);
		await google.setImportSince(userId, null);

		expect(await countMailboxes(db)).toBe(before);
	});

	it("is removed by Disconnect Microsoft", async () => {
		await microsoft.setImportSince(userId, null);

		expect(await microsoft.revoke(userId)).toEqual({ revoked: true });
		expect(await state.get(userId, "outlook")).toBeNull();
	});

	it("is removed by Disconnect Google", async () => {
		await google.setImportSince(userId, null);

		expect(await google.revoke(userId)).toEqual({ revoked: true });
		expect(await state.get(userId, "gmail")).toBeNull();
	});
});
