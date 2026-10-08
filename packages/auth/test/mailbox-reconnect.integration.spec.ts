import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, GoogleSyncStatus } from "@crm/db";
import { setTokenUtil } from "better-auth/oauth2";
import { auth } from "../src/auth";
import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
} from "../src/scopes";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `mailbox-reconnect-${suffix}`;
const REASON = "Google would not refresh the access token.";
const SOURCES = ["gmail", "calendar", "outlook", `imap:${suffix}`] as const;

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.account.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

const GOOGLE_SCOPE = ["openid", GMAIL_SCOPE, CALENDAR_SCOPE].join(",");
const MICROSOFT_SCOPE = `openid,https://graph.microsoft.com/${OUTLOOK_MAIL_SCOPE}`;

async function account(providerId: string, scope: string) {
	const id = `${providerId}-${userId}`;
	await db.account.create({
		data: {
			id,
			accountId: id,
			providerId,
			userId,
			scope,
			refreshToken: null,
		},
	});
	return id;
}

async function seal(plain: string): Promise<string> {
	const sealed = await setTokenUtil(plain, await auth.$context);
	if (!sealed) throw new Error("Better Auth sealed nothing.");
	return sealed;
}

async function storeGrant(
	accountId: string,
	tokens: { accessToken: string; refreshToken?: string },
) {
	const context = await auth.$context;
	const accessToken = await seal(tokens.accessToken);
	if (!tokens.refreshToken) {
		await context.internalAdapter.updateAccount(accountId, { accessToken });
		return;
	}
	await context.internalAdapter.updateAccount(accountId, {
		accessToken,
		refreshToken: await seal(tokens.refreshToken),
	});
}

async function statusOf() {
	const rows = await db.mailboxSync.findMany({
		where: { userId },
		select: {
			source: true,
			status: true,
			lastError: true,
			cursor: true,
			autoCreate: true,
		},
	});
	return Object.fromEntries(rows.map((row) => [row.source, row]));
}

beforeEach(async () => {
	await clean();
	await db.user.create({
		data: {
			id: userId,
			name: "Reconnect",
			email: `${userId}@example.com`,
		},
	});
	for (const source of SOURCES) {
		await db.mailboxSync.create({
			data: {
				userId,
				source,
				status: GoogleSyncStatus.NEEDS_RECONNECT,
				lastError: REASON,
				cursor: `cursor-${source}`,
				autoCreate: true,
			},
		});
	}
});

afterAll(clean);

describe("a fresh mailbox grant stored by Better Auth", () => {
	it("moves the Google sources out of NEEDS_RECONNECT", async () => {
		const id = await account(GOOGLE_PROVIDER_ID, GOOGLE_SCOPE);

		await storeGrant(id, {
			accessToken: "fresh-access",
			refreshToken: "fresh-refresh",
		});

		const rows = await statusOf();
		for (const source of ["gmail", "calendar"]) {
			expect(rows[source]).toEqual({
				source,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				cursor: `cursor-${source}`,
				autoCreate: true,
			});
		}
		expect(rows.outlook?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		expect(rows[`imap:${suffix}`]?.status).toBe(
			GoogleSyncStatus.NEEDS_RECONNECT,
		);
	});

	it("moves the Outlook source out of NEEDS_RECONNECT", async () => {
		const id = await account(MICROSOFT_PROVIDER_ID, MICROSOFT_SCOPE);

		await storeGrant(id, {
			accessToken: "fresh-access",
			refreshToken: "fresh-refresh",
		});

		const rows = await statusOf();
		expect(rows.outlook?.status).toBe(GoogleSyncStatus.IDLE);
		expect(rows.outlook?.lastError).toBeNull();
		expect(rows.gmail?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
	});

	it("keeps a source in NEEDS_RECONNECT when the grant lacks its scope", async () => {
		const id = await account(
			GOOGLE_PROVIDER_ID,
			["openid", CALENDAR_SCOPE].join(","),
		);

		await storeGrant(id, {
			accessToken: "fresh-access",
			refreshToken: "fresh-refresh",
		});

		const rows = await statusOf();
		expect(rows.calendar?.status).toBe(GoogleSyncStatus.IDLE);
		expect(rows.gmail?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		expect(rows.gmail?.lastError).toBe(REASON);
	});

	it("keeps NEEDS_RECONNECT when the account holds no refresh token", async () => {
		const id = await account(MICROSOFT_PROVIDER_ID, MICROSOFT_SCOPE);

		await storeGrant(id, { accessToken: "fresh-access" });

		const rows = await statusOf();
		expect(rows.outlook?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		expect(rows.outlook?.lastError).toBe(REASON);
	});

	it("leaves the mailbox alone when another provider stores a token", async () => {
		const id = await account("github", GOOGLE_SCOPE);

		await storeGrant(id, {
			accessToken: "fresh-access",
			refreshToken: "fresh-refresh",
		});

		const rows = await statusOf();
		for (const source of SOURCES) {
			expect(rows[source]?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		}
	});
});
