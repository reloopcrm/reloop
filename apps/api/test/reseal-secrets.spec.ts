import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { openToken } from "@crm/auth/token-seal";
import {
	createDatabase,
	dropDatabase,
	migrateDatabase,
} from "@crm/db/provision";
import { openSecret, sealSecret, secretKey } from "@crm/db/secrets";
import { SETTINGS_ID } from "@crm/db/settings";
import { testDatabaseUrl } from "@crm/db/test-database";
import { symmetricEncrypt } from "better-auth/crypto";
import pg from "pg";
import { IMAP_CREDENTIALS } from "../src/imap/imap-credentials";
import { SETTINGS } from "../src/settings/settings.config";
import {
	type ResealLine,
	resealDatabase,
	resealSummary,
	SEALED_FIELDS,
} from "../src/tenancy/reseal-secrets";

const runId = (process.env.TEST_RUN_ID ?? "spec")
	.toLowerCase()
	.replace(/[^a-z0-9]/g, "");
const OLD = "the-old-single-tenant-secret-0123456789";
const NEW = "the-cloud-secret-abcdefghijklmnopqrstuvwxyz";
const PREPARE_TIMEOUT_MS = 120_000;

function databaseUrl(): string {
	const url = new URL(testDatabaseUrl(process.env));
	url.pathname = `/crm_reseal_${runId}_test`;
	return url.toString();
}

const statusOf = (lines: ResealLine[], column: string, id: string) =>
	lines.find((line) => line.column === column && line.id === id)?.status;

describe("re-sealing a restored database", () => {
	const url = databaseUrl();
	let client: pg.Client;
	const read = async (sql: string) => (await client.query(sql)).rows[0];

	beforeAll(async () => {
		await dropDatabase(url);
		await createDatabase(url);
		await migrateDatabase(url);
		client = new pg.Client({ connectionString: url });
		await client.connect();

		const now = new Date();
		const providerKey = secretKey(OLD, SETTINGS.providerKeys.purpose);
		await client.query(
			'INSERT INTO "appSetting" (id, "agentOpenaiKey", "agentAnthropicKey", "googleClientSecret", "contextDevApiKey", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
			[
				SETTINGS_ID,
				sealSecret("sk-openai-old", providerKey),
				null,
				"typed-in-clear",
				sealSecret("ctx-key", secretKey("another-secret-entirely", "x")),
				now,
			],
		);
		await client.query(
			'INSERT INTO "user" (id, name, email, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4)',
			["reseal-user", "Reseal", `reseal-${runId}@example.com`, now],
		);
		await client.query(
			'INSERT INTO "imapAccount" (id, "userId", email, host, username, secret, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
			[
				"imap-1",
				"reseal-user",
				"box@example.com",
				"imap.example.com",
				"box",
				sealSecret("app-password", secretKey(OLD, IMAP_CREDENTIALS.purpose)),
				now,
			],
		);
		await client.query(
			'INSERT INTO "account" (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
			[
				"acct-1",
				"google-1",
				"google",
				"reseal-user",
				await symmetricEncrypt({ key: OLD, data: "ya29.access" }),
				null,
				now,
			],
		);
	}, PREPARE_TIMEOUT_MS);

	afterAll(async () => {
		await client?.end();
		await dropDatabase(url);
	});

	it("reads back every secret with the new key, keeps a failed row and says so", async () => {
		const lines = await resealDatabase(url, OLD, NEW);

		expect(statusOf(lines, "agentOpenaiKey", SETTINGS_ID)).toBe("ok");
		expect(statusOf(lines, "agentAnthropicKey", SETTINGS_ID)).toBe("empty");
		expect(statusOf(lines, "googleClientSecret", SETTINGS_ID)).toBe("plain");
		expect(statusOf(lines, "contextDevApiKey", SETTINGS_ID)).toBe("failed");
		expect(statusOf(lines, "secret", "imap-1")).toBe("ok");
		expect(statusOf(lines, "accessToken", "acct-1")).toBe("ok");
		expect(statusOf(lines, "refreshToken", "acct-1")).toBe("empty");

		const settings = await read(
			`SELECT "agentOpenaiKey", "googleClientSecret", "contextDevApiKey" FROM "appSetting" WHERE id = '${SETTINGS_ID}'`,
		);
		expect(
			openSecret(
				settings.agentOpenaiKey,
				secretKey(NEW, SETTINGS.providerKeys.purpose),
			),
		).toBe("sk-openai-old");
		expect(settings.googleClientSecret).toBe("typed-in-clear");
		expect(() =>
			openSecret(settings.contextDevApiKey, secretKey(NEW, "context-dev-key")),
		).toThrow();

		const imap = await read(
			`SELECT secret FROM "imapAccount" WHERE id = 'imap-1'`,
		);
		expect(
			openSecret(imap.secret, secretKey(NEW, IMAP_CREDENTIALS.purpose)),
		).toBe("app-password");

		const account = await read(
			`SELECT "accessToken" FROM "account" WHERE id = 'acct-1'`,
		);
		expect(await openToken(account.accessToken, NEW)).toBe("ya29.access");

		const summary = resealSummary(lines).join("\n");
		expect(summary).toContain(
			"appSetting.contextDevApiKey: 0 ok, 0 plain, 0 empty, 1 failed",
		);
		expect(summary).toContain("imapAccount.secret: 1 ok");
		expect(summary).not.toContain("app-password");
		expect(summary).not.toContain("sk-openai");
	});

	it("covers every sealed column the code writes", () => {
		const names = SEALED_FIELDS.map(
			(field) => `${field.table}.${field.column}`,
		);
		expect(names).toEqual([
			"appSetting.agentOpenrouterKey",
			"appSetting.agentOpenaiKey",
			"appSetting.agentAnthropicKey",
			"appSetting.typesafeApiKey",
			"appSetting.contextDevApiKey",
			"appSetting.googleClientSecret",
			"appSetting.microsoftClientSecret",
			"appSetting.slackClientSecret",
			"imapAccount.secret",
			"webhook.secret",
			"slackWorkspaceGrant.userToken",
			"slackInstallation.userToken",
			"account.accessToken",
			"account.refreshToken",
			"account.idToken",
		]);
	});
});
