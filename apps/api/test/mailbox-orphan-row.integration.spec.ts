import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
} from "@crm/auth";
import { db, GoogleSyncStatus } from "@crm/db";
import { readPlan, writePlan } from "@crm/db/settings";
import { actWithoutPlans, actWithTestPlans } from "@crm/db/test-plans";
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
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import type { GraphClient } from "../src/microsoft/graph.client";
import { MicrosoftConnectionService } from "../src/microsoft/microsoft-connection.service";
import { OutlookSyncService } from "../src/microsoft/outlook-sync.service";

const suffix = process.env.TEST_RUN_ID ?? "orphan-row-spec";
const userId = `orphan-${suffix}`;
const secondId = `orphan-second-${suffix}`;
const users = [userId, secondId];
let planBefore: string | null = null;

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
const participants = new ThreadParticipantsService(db, match, stamp, agent);
const microsoft = new MicrosoftConnectionService(
	db,
	tokens,
	state,
	stamp,
	participants,
);
const google = new GoogleConnectionService(
	db,
	tokens,
	state,
	match,
	stamp,
	participants,
);
const outlook = new OutlookSyncService(
	db,
	{} as GraphClient,
	tokens,
	state,
	{} as ThreadWriterService,
);

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId: { in: users } } });
	await db.account.deleteMany({ where: { userId: { in: users } } });
	await db.user.deleteMany({ where: { id: { in: users } } });
}

async function grant(id: string, providerId: string, scope: string) {
	await db.account.create({
		data: {
			id: `account-${id}`,
			accountId: `account-${id}`,
			providerId,
			userId: id,
			scope,
		},
	});
}

beforeAll(async () => {
	actWithTestPlans();
	planBefore = await readPlan(db);
});

beforeEach(async () => {
	await clean();
	for (const id of users) {
		await db.user.create({
			data: { id, name: "Orphan", email: `${id}@example.com` },
		});
	}
});

afterAll(async () => {
	await clean();
	await writePlan(db, planBefore);
	actWithoutPlans();
});

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
		expect(await state.listForUser(userId)).toHaveLength(2);

		expect(await countMailboxes(db)).toBe(before);
	});

	it("is removed by Disconnect Microsoft", async () => {
		await microsoft.setImportSince(userId, null);
		expect(await state.get(userId, "outlook")).not.toBeNull();

		expect(await microsoft.revoke(userId)).toEqual({ revoked: true });
		expect(await state.get(userId, "outlook")).toBeNull();
	});

	it("is removed by Disconnect Google", async () => {
		await google.setImportSince(userId, null);
		expect(await state.get(userId, "gmail")).not.toBeNull();

		expect(await google.revoke(userId)).toEqual({ revoked: true });
		expect(await state.get(userId, "gmail")).toBeNull();
	});
});

describe("an unfinished mailbox connection that finishes", () => {
	it("stays when the plan has room for it", async () => {
		await writePlan(db, "small");
		expect(await countMailboxes(db)).toBe(0);
		await google.setImportSince(userId, null);
		await grant(userId, GOOGLE_PROVIDER_ID, GMAIL_SCOPE);

		await google.onConnected(userId);

		expect(await state.get(userId, "gmail")).not.toBeNull();
		expect(await countMailboxes(db)).toBe(1);
	});

	it("keeps two Gmail connections inside a one-mailbox plan", async () => {
		await writePlan(db, "small");
		expect(await countMailboxes(db)).toBe(0);
		for (const id of users) await google.setImportSince(id, null);
		for (const id of users) await grant(id, GOOGLE_PROVIDER_ID, GMAIL_SCOPE);
		expect(await countMailboxes(db)).toBe(2);

		for (const id of users) await google.onConnected(id);

		expect(await countMailboxes(db)).toBe(1);
		expect(
			await db.mailboxSync.count({ where: { userId: { in: users } } }),
		).toBe(1);
	});

	it("keeps two Outlook connections inside a one-mailbox plan", async () => {
		await writePlan(db, "small");
		expect(await countMailboxes(db)).toBe(0);
		for (const id of users) await microsoft.setImportSince(id, null);
		for (const id of users)
			await grant(id, MICROSOFT_PROVIDER_ID, OUTLOOK_MAIL_SCOPE);
		expect(await countMailboxes(db)).toBe(2);

		for (const id of users) await microsoft.onConnected(id);

		expect(await countMailboxes(db)).toBe(1);
		expect(
			await db.mailboxSync.count({ where: { userId: { in: users } } }),
		).toBe(1);
	});

	it("keeps a row a sync tick is running on", async () => {
		await writePlan(db, "small");
		for (const id of users) await google.setImportSince(id, null);
		for (const id of users) await grant(id, GOOGLE_PROVIDER_ID, GMAIL_SCOPE);
		const row = await state.get(userId, "gmail");
		if (!row) throw new Error("setImportSince stored no row");
		expect(await state.claim(row, new Date())).toBe(true);

		await google.onConnected(userId);

		expect((await state.get(userId, "gmail"))?.status).toBe(
			GoogleSyncStatus.RUNNING,
		);
		await state.settle(row.id, { status: GoogleSyncStatus.IDLE });
		expect((await state.get(userId, "gmail"))?.lastSyncedAt).not.toBeNull();
	});
});
