import "@crm/env/load";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { CONTACT_LIMIT_MESSAGE, PLANS } from "../src/plans";
import { testDatabaseUrl } from "../src/test-database";

const MIGRATIONS = [
	"20260913000000_enforce_contact_plan_limit",
	"20260921120000_plan_ids",
];

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
		"INSERT INTO contact SELECT 'row-' || generate_series($1::int, $2::int)",
		[(await contacts()) + 1, total],
	);
	await client.query("ALTER TABLE contact ENABLE TRIGGER contact_plan_limit");
}

async function insertOne(id: string): Promise<void> {
	await client.query("INSERT INTO contact VALUES ($1)", [id]);
}

beforeAll(async () => {
	await client.connect();
	await client.query(`CREATE SCHEMA "${schema}"`);
	await client.query(`SET search_path TO "${schema}"`);
	await client.query(
		'CREATE TABLE "appSetting" (id text PRIMARY KEY, plan text)',
	);
	await client.query("CREATE TABLE contact (id text PRIMARY KEY)");
	await client.query(`INSERT INTO "appSetting" VALUES ('app', 'handel')`);

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

describe("the contact trigger after the plan migration", () => {
	it("moves an old handel row to standard", async () => {
		const row = await client.query<{ plan: string }>(
			`SELECT plan FROM "appSetting" WHERE id = 'app'`,
		);
		expect(row.rows[0]?.plan).toBe("standard");
	});

	it("lets a standard workspace pass two thousand contacts", async () => {
		await fillTo(2_000);
		await insertOne("contact-2001");
		expect(await contacts()).toBe(2_001);
	});

	it("stops a standard workspace at its own limit", async () => {
		await fillTo(PLANS.standard.contacts);
		expect(await contacts()).toBe(PLANS.standard.contacts);

		let failure: { code?: string; message?: string } | null = null;
		try {
			await insertOne("one-too-many");
		} catch (error) {
			failure = error as { code?: string; message?: string };
		}
		expect(failure?.code).toBe("23514");
		expect(failure?.message).toBe(CONTACT_LIMIT_MESSAGE);
		expect(await contacts()).toBe(PLANS.standard.contacts);
	});

	it("keeps an install without a plan unlimited", async () => {
		await client.query(`UPDATE "appSetting" SET plan = NULL WHERE id = 'app'`);
		await insertOne("no-plan");
		expect(await contacts()).toBe(PLANS.standard.contacts + 1);
	});
});
