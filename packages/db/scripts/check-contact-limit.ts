import "@crm/env/load";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { CONTACT_LIMIT_MESSAGE, PLANS } from "../src/plans";

if (!process.argv.includes("--authorized-disposable-database")) {
	throw new Error(
		"This check requires explicit authorization for a separate disposable database.",
	);
}
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) {
	throw new Error(
		"Set TEST_DATABASE_URL to an authorized disposable database ending in _test.",
	);
}
const schema = `contact_limit_${randomUUID().replaceAll("-", "")}`;
const clients = [
	new pg.Client({ connectionString: url }),
	new pg.Client({ connectionString: url }),
];
try {
	await Promise.all(clients.map((client) => client.connect()));
	const first = clients[0];
	const second = clients[1];
	assert(first && second);
	await first.query(`CREATE SCHEMA "${schema}"`);
	for (const client of clients) {
		await client.query(`SET search_path TO "${schema}"`);
		await client.query(
			"SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED",
		);
	}
	await first.query(
		'CREATE TABLE "appSetting" (id text PRIMARY KEY, plan text)',
	);
	await first.query("CREATE TABLE contact (id text PRIMARY KEY)");
	await first.query('INSERT INTO "appSetting" VALUES ($1, $2)', [
		"app",
		"trial",
	]);
	await first.query("INSERT INTO contact SELECT generate_series(1, $1)::text", [
		PLANS.trial.contacts - 1,
	]);
	for (const migration of [
		"20260913000000_enforce_contact_plan_limit",
		"20260921120000_plan_ids",
	]) {
		await first.query(
			await readFile(
				new URL(
					`../prisma/migrations/${migration}/migration.sql`,
					import.meta.url,
				),
				"utf8",
			),
		);
	}
	const results = await Promise.allSettled(
		clients.map((client, index) =>
			client.query("INSERT INTO contact VALUES ($1)", [`parallel-${index}`]),
		),
	);
	assert.equal(
		results.filter((result) => result.status === "fulfilled").length,
		1,
	);
	const rejected = results.find((result) => result.status === "rejected");
	assert(rejected?.status === "rejected");
	assert.equal(rejected.reason.code, "23514");
	assert.equal(rejected.reason.message, CONTACT_LIMIT_MESSAGE);
	const count = await first.query("SELECT count(*)::int AS total FROM contact");
	assert.equal(count.rows[0].total, PLANS.trial.contacts);
	await first.query(
		"INSERT INTO contact VALUES ('1') ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id",
	);
	await assert.rejects(
		first.query("INSERT INTO contact VALUES ('over-limit')"),
		{ code: "23514" },
	);
	assert.equal(
		(await first.query("SELECT count(*)::int AS total FROM contact")).rows[0]
			.total,
		PLANS.trial.contacts,
	);
	console.log(
		`Parallel contact limit check passes. Test records remain in schema ${schema}.`,
	);
} finally {
	await Promise.all(clients.map((client) => client.end()));
}
