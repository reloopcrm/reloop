import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db, GoogleSyncStatus } from "@crm/db";
import { MAILBOX_ACCESS_ENDED_REASON } from "@crm/validation/mailbox-reasons";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { ImapClientFactory } from "../src/imap/imap.client";
import type { ImapCredentialService } from "../src/imap/imap-credentials";
import { ImapSyncService } from "../src/imap/imap-sync.service";
import { imapSourceFor } from "../src/mailbox/mailbox.constants";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";
import { WorkspaceService } from "../src/workspace/workspace.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ownerId = `tokens-owner-${RUN}`;
const targetId = `tokens-target-${RUN}`;
const otherId = `tokens-other-${RUN}`;
const people = [ownerId, targetId, otherId];
const targetEmail = `preview-${targetId}@example.com`;
const slackInstallerId = `U-${RUN}`;
const imapId = `imap-${RUN}`;

const service = new WorkspaceService(
	db,
	undefined as unknown as AgentTriggerService,
);
const state = new SyncStateService(db);

const later = new Date("2030-01-01T00:00:00.000Z");

const tokens = (prefix: string) => ({
	accessToken: `${prefix}-access`,
	refreshToken: `${prefix}-refresh`,
	idToken: `${prefix}-id`,
	accessTokenExpiresAt: later,
	refreshTokenExpiresAt: later,
});

async function seedPerson(id: string, role: string): Promise<string> {
	await db.user.create({
		data: {
			id,
			name: id,
			email: `preview-${id}@example.com`,
			emailVerified: true,
			updatedAt: new Date(),
		},
	});
	const member = await db.member.create({
		data: {
			id: `member-${id}`,
			organizationId: WORKSPACE_ID,
			userId: id,
			role,
			createdAt: new Date(),
		},
		select: { id: true },
	});
	return member.id;
}

async function seedAccount(
	userId: string,
	providerId: string,
	accountId: string,
	scope: string,
) {
	await db.account.create({
		data: {
			id: `${providerId}-${userId}`,
			accountId,
			providerId,
			userId,
			scope,
			...tokens(`${providerId}-${userId}`),
			updatedAt: new Date(),
		},
	});
}

async function seedSync(userId: string, source: string) {
	await db.mailboxSync.create({
		data: {
			userId,
			source,
			status: GoogleSyncStatus.IDLE,
			cursor: `cursor-${source}`,
			autoCreate: true,
			lastSyncedAt: new Date(),
		},
	});
}

async function clean() {
	await db.session.deleteMany({ where: { userId: { in: people } } });
	await db.apikey.deleteMany({ where: { referenceId: { in: people } } });
	await db.slackInstallation.deleteMany({
		where: { installerId: slackInstallerId },
	});
	await db.member.deleteMany({ where: { userId: { in: people } } });
	await db.user.deleteMany({ where: { id: { in: people } } });
}

let targetMemberId = "";

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await clean();
	await seedPerson(ownerId, "owner");
	targetMemberId = await seedPerson(targetId, "member");
	await seedPerson(otherId, "member");

	await seedAccount(targetId, "google", `g-${RUN}`, "gmail calendar");
	await seedAccount(targetId, "microsoft", `m-${RUN}`, "Mail.Read");
	await seedAccount(targetId, "slack", slackInstallerId, "chat:write");
	await seedAccount(otherId, "google", `g-other-${RUN}`, "gmail");

	await db.imapAccount.create({
		data: {
			id: imapId,
			userId: targetId,
			email: targetEmail,
			host: "imap.example.com",
			username: targetEmail,
			secret: "sealed-imap-password",
		},
	});

	await db.slackInstallation.create({
		data: {
			installerId: slackInstallerId,
			teamId: `T-${RUN}`,
			userToken: "sealed-slack-user-token",
			userScopes: "channels:write",
		},
	});

	for (const source of ["gmail", "calendar", "outlook", imapSourceFor(imapId)])
		await seedSync(targetId, source);
	await seedSync(otherId, "gmail");

	await service.removeMember(ownerId, { memberId: targetMemberId });
});

afterAll(clean);

const accountOf = (userId: string, providerId: string) =>
	db.account.findUniqueOrThrow({ where: { id: `${providerId}-${userId}` } });

const clearedSecrets = {
	accessToken: null,
	refreshToken: null,
	idToken: null,
	accessTokenExpiresAt: null,
	refreshTokenExpiresAt: null,
};

describe("removing a member ends their stored mailbox access", () => {
	it("clears the Google and Microsoft tokens and keeps the account rows", async () => {
		for (const providerId of ["google", "microsoft"]) {
			const account = await accountOf(targetId, providerId);
			expect(account).toMatchObject(clearedSecrets);
			expect(account.scope).not.toBeNull();
		}
	});

	it("clears the sealed IMAP password and keeps the mailbox", async () => {
		const imap = await db.imapAccount.findUniqueOrThrow({
			where: { id: imapId },
		});
		expect(imap.secret).toBeNull();
		expect(imap.host).toBe("imap.example.com");
	});

	it("clears the pending Slack user token of that person", async () => {
		const install = await db.slackInstallation.findUniqueOrThrow({
			where: { installerId: slackInstallerId },
		});
		expect(install.userToken).toBeNull();
	});

	it("keeps the workspace Slack bot token", async () => {
		const slack = await accountOf(targetId, "slack");
		expect(slack.accessToken).toBe(`slack-${targetId}-access`);
	});

	it("marks every mailbox of that person as needing a reconnect and keeps its cursor", async () => {
		const rows = await db.mailboxSync.findMany({
			where: { userId: targetId },
			orderBy: { source: "asc" },
		});

		expect(rows).toHaveLength(4);
		for (const row of rows) {
			expect(row.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
			expect(row.lastError).toBe(MAILBOX_ACCESS_ENDED_REASON);
			expect(row.cursor).toBe(`cursor-${row.source}`);
			expect(row.autoCreate).toBe(true);
		}
	});

	it("leaves another member's tokens and mailbox alone", async () => {
		const other = await accountOf(otherId, "google");
		expect(other).toMatchObject(tokens(`google-${otherId}`));

		const row = await state.get(otherId, "gmail");
		expect(row?.status).toBe(GoogleSyncStatus.IDLE);
		expect(row?.lastError).toBeNull();
	});
});

describe("adding the removed person again", () => {
	beforeAll(async () => {
		await service.addPerson(
			ownerId,
			{ email: targetEmail, name: targetId, role: "member" },
			{ createdAt: new Date(), token: "browser-session-token" },
		);
	});

	it("brings no token and no password back", async () => {
		for (const providerId of ["google", "microsoft"])
			expect(await accountOf(targetId, providerId)).toMatchObject(
				clearedSecrets,
			);

		const imap = await db.imapAccount.findUniqueOrThrow({
			where: { id: imapId },
		});
		expect(imap.secret).toBeNull();
	});

	it("keeps their mailboxes out of the sync tick", async () => {
		const due = await state.due(new Date());
		expect(due.some((row) => row.userId === targetId)).toBe(false);
		expect(due.some((row) => row.userId === otherId)).toBe(true);
	});

	it("stops an IMAP check without a password instead of failing", async () => {
		const refuse = () => {
			throw new Error("the mailbox must not be opened");
		};
		const imap = new ImapSyncService(
			db,
			{ connect: refuse } as unknown as ImapClientFactory,
			{ open: refuse } as unknown as ImapCredentialService,
			state,
			{} as ThreadWriterService,
		);

		const outcome = await imap.runOne(targetId, imapSourceFor(imapId));

		expect(outcome?.status).toBe("reconnect");
		const row = await state.get(targetId, imapSourceFor(imapId));
		expect(row?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		expect(row?.lastError).toBe(MAILBOX_ACCESS_ENDED_REASON);
	});
});
