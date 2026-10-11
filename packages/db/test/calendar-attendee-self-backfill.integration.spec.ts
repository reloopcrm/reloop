import "@crm/env/load";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { testDatabaseUrl } from "../src/test-database";

const MIGRATION = "20261008170010_calendar_attendee_is_self_backfill";

const schema = `attendee_self_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({
	connectionString: testDatabaseUrl(process.env),
});

async function selfFlags(): Promise<Record<string, boolean>> {
	const result = await client.query<{ id: string; isSelf: boolean }>(
		'SELECT id, "isSelf" FROM "calendarAttendee" ORDER BY id',
	);
	return Object.fromEntries(result.rows.map((row) => [row.id, row.isSelf]));
}

beforeAll(async () => {
	await client.connect();
	await client.query(`CREATE SCHEMA "${schema}"`);
	await client.query(`SET search_path TO "${schema}"`);
	await client.query('CREATE TABLE "user" (id text PRIMARY KEY, email text)');
	await client.query(
		'CREATE TABLE "mailboxSync" (id text PRIMARY KEY, "userId" text, source text, address text)',
	);
	await client.query(
		'CREATE TABLE "calendarAttendee" (id text PRIMARY KEY, email text, "isSelf" boolean NOT NULL DEFAULT false)',
	);

	await client.query(`INSERT INTO "user" VALUES
		('rep', 'Rep@preview.example.com'),
		('mailbox-rep', 'login@preview.example.com'),
		('no-calendar', 'quiet@preview.example.com')`);
	await client.query(`INSERT INTO "mailboxSync" VALUES
		('rep-calendar', 'rep', 'calendar', NULL),
		('mailbox-rep-calendar', 'mailbox-rep', 'calendar', NULL),
		('mailbox-rep-gmail', 'mailbox-rep', 'gmail', 'inbox@preview.example.com'),
		('no-calendar-gmail', 'no-calendar', 'gmail', 'quiet-inbox@preview.example.com')`);
	await client.query(`INSERT INTO "calendarAttendee" (id, email) VALUES
		('a-rep', 'rep@preview.example.com'),
		('b-rep-mailbox', 'inbox@preview.example.com'),
		('c-guest', 'guest@preview.example.com'),
		('d-no-calendar', 'quiet@preview.example.com'),
		('e-no-calendar-mailbox', 'quiet-inbox@preview.example.com')`);

	await client.query(
		await readFile(
			new URL(
				`../prisma/migrations/${MIGRATION}/migration.sql`,
				import.meta.url,
			),
			"utf8",
		),
	);
});

afterAll(async () => {
	await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
	await client.end();
});

describe("the attendee self backfill", () => {
	it("marks the reps whose calendar is synced and nobody else", async () => {
		expect(await selfFlags()).toEqual({
			"a-rep": true,
			"b-rep-mailbox": true,
			"c-guest": false,
			"d-no-calendar": false,
			"e-no-calendar-mailbox": false,
		});
	});
});
