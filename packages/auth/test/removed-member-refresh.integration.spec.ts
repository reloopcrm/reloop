import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, GoogleSyncStatus } from "@crm/db";
import { MAILBOX_ACCESS_ENDED_REASON } from "@crm/validation/mailbox-reasons";
import { setTokenUtil } from "better-auth/oauth2";
import { auth } from "../src/auth";
import { GMAIL_SCOPE, GOOGLE_PROVIDER_ID } from "../src/scopes";
import { forgetStoredGrantsOf } from "../src/sign-in-grants";

const suffix = crypto.randomUUID().slice(0, 8);
const removedId = `refresh-removed-${suffix}`;
const activeId = `refresh-active-${suffix}`;
const people = [removedId, activeId];
const SCOPE = ["openid", GMAIL_SCOPE].join(",");

async function seal(plain: string): Promise<string> {
	const sealed = await setTokenUtil(plain, await auth.$context);
	if (!sealed) throw new Error("Better Auth sealed nothing.");
	return sealed;
}

async function seed(userId: string) {
	await db.user.create({
		data: {
			id: userId,
			name: userId,
			email: `preview-${userId}@example.com`,
		},
	});
	await db.account.create({
		data: {
			id: `google-${userId}`,
			accountId: `google-${userId}`,
			providerId: GOOGLE_PROVIDER_ID,
			userId,
			scope: SCOPE,
			accessToken: await seal(`access-${userId}`),
			refreshToken: await seal(`refresh-${userId}`),
		},
	});
	await db.mailboxSync.create({
		data: { userId, source: "gmail", status: GoogleSyncStatus.IDLE },
	});
}

async function refreshWrite(userId: string) {
	const context = await auth.$context;
	await context.internalAdapter.updateAccount(`google-${userId}`, {
		accessToken: await seal(`late-access-${userId}`),
		refreshToken: await seal(`late-refresh-${userId}`),
		accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
	});
}

const tokensOf = (userId: string) =>
	db.account.findUniqueOrThrow({
		where: { id: `google-${userId}` },
		select: { accessToken: true, refreshToken: true },
	});

const statusOf = (userId: string) =>
	db.mailboxSync.findUniqueOrThrow({
		where: { userId_source: { userId, source: "gmail" } },
		select: { status: true, lastError: true },
	});

async function clean() {
	await db.user.deleteMany({ where: { id: { in: people } } });
}

beforeAll(async () => {
	await clean();
	for (const userId of people) await seed(userId);

	await db.$transaction(async (tx) => {
		await tx.user.update({
			where: { id: removedId },
			data: { removedAt: new Date() },
		});
		await forgetStoredGrantsOf(tx, [removedId]);
	});
});

afterAll(clean);

describe("a token refresh that lands after the removal", () => {
	it("does not bring the removed person's tokens back", async () => {
		await refreshWrite(removedId);

		expect(await tokensOf(removedId)).toEqual({
			accessToken: null,
			refreshToken: null,
		});
	});

	it("keeps the removed person's mailbox waiting for a reconnect", async () => {
		await db.mailboxSync.update({
			where: { userId_source: { userId: removedId, source: "gmail" } },
			data: {
				status: GoogleSyncStatus.NEEDS_RECONNECT,
				lastError: MAILBOX_ACCESS_ENDED_REASON,
			},
		});

		await refreshWrite(removedId);

		expect(await statusOf(removedId)).toEqual({
			status: GoogleSyncStatus.NEEDS_RECONNECT,
			lastError: MAILBOX_ACCESS_ENDED_REASON,
		});
	});

	it("still stores a refresh for an active member", async () => {
		await refreshWrite(activeId);

		const tokens = await tokensOf(activeId);
		expect(tokens.accessToken).not.toBeNull();
		expect(tokens.refreshToken).not.toBeNull();
		expect(await statusOf(activeId)).toEqual({
			status: GoogleSyncStatus.IDLE,
			lastError: null,
		});
	});
});
