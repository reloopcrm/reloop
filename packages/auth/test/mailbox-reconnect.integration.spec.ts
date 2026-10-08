import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, GoogleSyncStatus } from "@crm/db";
import { setTokenUtil } from "better-auth/oauth2";
import { auth } from "../src/auth";
import { GOOGLE_PROVIDER_ID, MICROSOFT_PROVIDER_ID } from "../src/scopes";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `mailbox-reconnect-${suffix}`;
const REASON = "Google would not refresh the access token.";
const SOURCES = ["gmail", "calendar", "outlook", `imap:${suffix}`] as const;

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.account.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function account(providerId: string, refreshToken: string | null) {
	const id = `${providerId}-${userId}`;
	await db.account.create({
		data: {
			id,
			accountId: id,
			providerId,
			userId,
			refreshToken,
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
		const id = await account(GOOGLE_PROVIDER_ID, null);

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
		const id = await account(MICROSOFT_PROVIDER_ID, null);

		await storeGrant(id, {
			accessToken: "fresh-access",
			refreshToken: "fresh-refresh",
		});

		const rows = await statusOf();
		expect(rows.outlook?.status).toBe(GoogleSyncStatus.IDLE);
		expect(rows.outlook?.lastError).toBeNull();
		expect(rows.gmail?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
	});

	it("keeps NEEDS_RECONNECT when the account holds no refresh token", async () => {
		const id = await account(MICROSOFT_PROVIDER_ID, null);

		await storeGrant(id, { accessToken: "fresh-access" });

		const rows = await statusOf();
		expect(rows.outlook?.status).toBe(GoogleSyncStatus.NEEDS_RECONNECT);
		expect(rows.outlook?.lastError).toBe(REASON);
	});

	it("leaves the mailbox alone when another provider stores a token", async () => {
		const id = await account("github", null);

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
