import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
} from "@crm/auth";
import { db, GoogleSyncStatus } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { GoogleConnectionService } from "../src/google/google-connection.service";
import {
	planBackfill,
	serialiseBackfill,
} from "../src/mailbox/backfill-cursor";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import { MicrosoftConnectionService } from "../src/microsoft/microsoft-connection.service";

const suffix = process.env.TEST_RUN_ID ?? "reconnect-settings-spec";
const userId = `reconnect-${suffix}`;

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
const google = new GoogleConnectionService(
	db,
	tokens,
	state,
	match,
	stamp,
	participants,
);
const microsoft = new MicrosoftConnectionService(
	db,
	tokens,
	state,
	stamp,
	participants,
);

const IMPORT_SINCE = new Date("2025-01-01T00:00:00.000Z");
const BACKFILL = serialiseBackfill({
	...planBackfill({
		before: new Date("2026-06-01T00:00:00.000Z"),
		floor: IMPORT_SINCE,
	}),
	phase: "all",
	position: "page-7",
	reached: "2025-09-01T00:00:00.000Z",
});

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.account.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function brokenMailbox(
	providerId: string,
	scope: string,
	source: "gmail" | "outlook",
) {
	await db.account.create({
		data: {
			id: `account-${userId}`,
			accountId: `account-${userId}`,
			providerId,
			userId,
			scope,
			refreshToken: "revoked-refresh-token",
		},
	});
	await db.mailboxSync.create({
		data: {
			userId,
			source,
			status: GoogleSyncStatus.NEEDS_RECONNECT,
			lastError: "The grant was revoked.",
			lastSyncedAt: new Date("2026-05-01T00:00:00.000Z"),
			autoCreate: true,
			createWithoutReply: true,
			createFrom: "relevant",
			importSince: IMPORT_SINCE,
			cursor: "history-42",
			backfill: BACKFILL,
		},
	});
}

async function relink(scope: string) {
	await db.account.update({
		where: { id: `account-${userId}` },
		data: {
			accessToken: "fresh-access-token",
			refreshToken: "fresh-refresh-token",
			scope,
		},
	});
}

function settingsOf(source: "gmail" | "outlook") {
	return db.mailboxSync.findUniqueOrThrow({
		where: { userId_source: { userId, source } },
		select: {
			autoCreate: true,
			createWithoutReply: true,
			createFrom: true,
			importSince: true,
			cursor: true,
			backfill: true,
		},
	});
}

beforeEach(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Reconnect", email: `${userId}@example.com` },
	});
});

afterAll(clean);

describe("a mailbox that is reconnected", () => {
	it("keeps the Gmail settings and import options", async () => {
		const scope = [GMAIL_SCOPE, CALENDAR_SCOPE].join(",");
		await brokenMailbox(GOOGLE_PROVIDER_ID, scope, "gmail");
		const before = await settingsOf("gmail");

		await relink(scope);
		const status = await google.status(userId);

		expect(status.linked).toBe(true);
		expect(await settingsOf("gmail")).toEqual(before);
		expect(before.importSince).toEqual(IMPORT_SINCE);
		expect(before.backfill).toBe(BACKFILL);
	});

	it("keeps the Outlook settings and import options", async () => {
		await brokenMailbox(MICROSOFT_PROVIDER_ID, OUTLOOK_MAIL_SCOPE, "outlook");
		const before = await settingsOf("outlook");

		await relink(OUTLOOK_MAIL_SCOPE);
		const status = await microsoft.status(userId);

		expect(status.linked).toBe(true);
		expect(await settingsOf("outlook")).toEqual(before);
		expect(before.autoCreate).toBe(true);
	});

	it("lets the next sync run clear the reconnect state and keep the settings", async () => {
		await brokenMailbox(MICROSOFT_PROVIDER_ID, OUTLOOK_MAIL_SCOPE, "outlook");
		const before = await settingsOf("outlook");
		await relink(OUTLOOK_MAIL_SCOPE);
		const row = await state.get(userId, "outlook");
		if (!row) throw new Error("the row is gone");

		await state.markRunning(row.id);
		await state.settle(row.id, {
			status: GoogleSyncStatus.IDLE,
			cursor: row.cursor,
			backfill: row.backfill,
		});

		const after = await state.get(userId, "outlook");
		expect(after?.status).toBe(GoogleSyncStatus.IDLE);
		expect(after?.lastError).toBeNull();
		expect(await settingsOf("outlook")).toEqual(before);
	});
});
