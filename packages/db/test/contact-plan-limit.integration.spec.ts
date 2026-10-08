import "@crm/env/load";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { CONTACT_LIMIT_MESSAGE } from "../src/plans";
import { testDatabaseUrl } from "../src/test-database";

const MIGRATIONS = [
	"20260913000000_enforce_contact_plan_limit",
	"20260921120000_plan_ids",
	"20261001090000_mailbox_profile",
	"20261001100000_contact_limit_revive",
	"20261008090000_contact_limit_column",
	"20261008100000_contact_limit_from_column",
];

const LIMIT = 2_500;

const schema = `plan_limit_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({
	connectionString: testDatabaseUrl(process.env),
});

async function contacts(): Promise<number> {
	const result = await client.query<{ total: number }>(
		"SELECT count(*)::int AS total FROM contact",
	);
	return result.rows[0]?.total ?? 0;
}

async function fillTo(total: number): Promise<void> {
	await client.query("ALTER TABLE contact DISABLE TRIGGER contact_plan_limit");
	await client.query(
		"INSERT INTO contact (id) SELECT 'row-' || generate_series($1::int, $2::int)",
		[(await contacts()) + 1, total],
	);
	await client.query("ALTER TABLE contact ENABLE TRIGGER contact_plan_limit");
}

async function insertOne(id: string): Promise<void> {
	await client.query("INSERT INTO contact (id) VALUES ($1)", [id]);
}

async function active(): Promise<number> {
	const result = await client.query<{ total: number }>(
		`SELECT count(*)::int AS total FROM contact WHERE "archivedAt" IS NULL`,
	);
	return result.rows[0]?.total ?? 0;
}

async function archivedId(): Promise<string> {
	const result = await client.query<{ id: string }>(
		`SELECT id FROM contact WHERE "archivedAt" IS NOT NULL LIMIT 1`,
	);
	const id = result.rows[0]?.id;
	if (!id) throw new Error("No archived contact to revive.");
	return id;
}

async function revive(id: string): Promise<void> {
	await client.query(
		`UPDATE contact SET "archivedAt" = NULL WHERE id = $1 AND "archivedAt" IS NOT NULL`,
		[id],
	);
}

async function archive(total: number): Promise<void> {
	await client.query(
		`UPDATE contact SET "archivedAt" = now() WHERE id IN (SELECT id FROM contact WHERE "archivedAt" IS NULL LIMIT $1)`,
		[total],
	);
}

async function setLimit(limit: number | null): Promise<void> {
	await client.query(
		`UPDATE "appSetting" SET "contactLimit" = $1 WHERE id = 'app'`,
		[limit],
	);
}

async function failure(
	work: () => Promise<unknown>,
): Promise<{ code?: string; message?: string } | null> {
	try {
		await work();
		return null;
	} catch (error) {
		return error as { code?: string; message?: string };
	}
}

beforeAll(async () => {
	await client.connect();
	await client.query(`CREATE SCHEMA "${schema}"`);
	await client.query(`SET search_path TO "${schema}"`);
	await client.query(
		'CREATE TABLE "appSetting" (id text PRIMARY KEY, plan text)',
	);
	await client.query(
		'CREATE TABLE contact (id text PRIMARY KEY, "archivedAt" timestamptz)',
	);
	await client.query('CREATE TABLE "mailboxSync" (id text PRIMARY KEY)');
	await client.query('CREATE TABLE "threadInsight" (id text PRIMARY KEY)');
	await client.query(`INSERT INTO "appSetting" VALUES ('app', 'erfunden')`);

	for (const migration of MIGRATIONS) {
		await client.query(
			await readFile(
				new URL(
					`../prisma/migrations/${migration}/migration.sql`,
					import.meta.url,
				),
				"utf8",
			),
		);
	}
});

afterAll(async () => {
	await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
	await client.end();
});

describe("the contact trigger after the column migration", () => {
	it("ignores the plan name and enforces nothing while the column is empty", async () => {
		await fillTo(LIMIT + 10);
		await insertOne("plan-name-only");
		expect(await contacts()).toBe(LIMIT + 11);
		await client.query("DELETE FROM contact");
	});

	it("lets a workspace pass two thousand contacts under a wider limit", async () => {
		await setLimit(LIMIT);
		await fillTo(2_000);
		await insertOne("contact-2001");
		expect(await contacts()).toBe(2_001);
	});

	it("stops a workspace at its stored limit", async () => {
		await fillTo(LIMIT);
		expect(await contacts()).toBe(LIMIT);

		const refused = await failure(() => insertOne("one-too-many"));
		expect(refused?.code).toBe("23514");
		expect(refused?.message).toBe(CONTACT_LIMIT_MESSAGE);
		expect(await contacts()).toBe(LIMIT);
	});

	it("does not count archived contacts against the limit", async () => {
		await archive(100);
		await insertOne("after-archive");
		expect(await contacts()).toBe(LIMIT + 1);

		await fillTo(LIMIT + 100);
		const refused = await failure(() => insertOne("active-over-limit"));
		expect(refused?.code).toBe("23514");
		expect(await contacts()).toBe(LIMIT + 100);
	});

	it("rejects a revive that passes the limit", async () => {
		const refused = await failure(async () => revive(await archivedId()));
		expect(refused?.code).toBe("23514");
		expect(refused?.message).toBe(CONTACT_LIMIT_MESSAGE);
		expect(await active()).toBe(LIMIT);
	});

	it("always allows archiving", async () => {
		await archive(1);
		expect(await active()).toBe(LIMIT - 1);
	});

	it("allows a revive under the limit", async () => {
		await revive(await archivedId());
		expect(await active()).toBe(LIMIT);
	});

	it("follows a raised limit at once", async () => {
		await setLimit(LIMIT + 200);
		await insertOne("after-raise");
		expect(await active()).toBe(LIMIT + 1);
	});

	it("keeps an install without a limit unlimited", async () => {
		await setLimit(null);
		await insertOne("no-limit");
		expect(await active()).toBe(LIMIT + 2);
	});
});
