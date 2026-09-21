import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import pg from "pg";
import {
	createTenant,
	ensureRegistrySchema,
	forgetTenants,
	type Tenant,
} from "./tenancy";
import { TENANCY } from "./tenancy-config";
import {
	databaseName,
	isTestDatabaseName,
	testDatabaseUrl,
} from "./test-database";

const DB_DIR = dirname(import.meta.dirname);
const MIGRATIONS = join(DB_DIR, "prisma", "migrations");

export const TEST_TENANTS = {
	registry: "reloop_registry_test",
	a: {
		id: "tenant-a",
		dbName: "crm_tenant_a_test",
		domain: "tenant-a.example",
	},
	b: {
		id: "tenant-b",
		dbName: "crm_tenant_b_test",
		domain: "tenant-b.example",
	},
} as const;

export type TestTenancy = {
	registryUrl: string;
	template: string;
	a: Tenant;
	b: Tenant;
};

function withDatabase(url: string, name: string): string {
	const parsed = new URL(url);
	parsed.pathname = `/${name}`;
	return parsed.toString();
}

async function createDatabase(url: string, name: string): Promise<void> {
	if (!isTestDatabaseName(name)) {
		throw new Error(`${name} does not end in _test. Refusing to create it.`);
	}

	const client = new pg.Client({
		connectionString: withDatabase(url, "postgres"),
	});
	await client.connect();
	try {
		const existing = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[name],
		);
		if (!existing.rowCount) await client.query(`CREATE DATABASE "${name}"`);
	} finally {
		await client.end();
	}
}

async function appliedMigrations(url: string): Promise<Set<string>> {
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const rows = await client.query<{ migration_name: string }>(
			"SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL",
		);
		return new Set(rows.rows.map((row) => row.migration_name));
	} catch {
		return new Set();
	} finally {
		await client.end();
	}
}

async function migrate(url: string): Promise<void> {
	const onDisk = existsSync(MIGRATIONS)
		? readdirSync(MIGRATIONS, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
		: [];
	const applied = await appliedMigrations(url);
	if (onDisk.every((name) => applied.has(name))) return;

	const cli = join(
		dirname(createRequire(import.meta.url).resolve("prisma/package.json")),
		"build",
		"index.js",
	);
	const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
		cwd: DB_DIR,
		env: { ...process.env, DATABASE_URL: url },
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(
			`prisma migrate deploy failed for ${databaseName(url)}:\n${result.stderr}`,
		);
	}
}

export async function prepareTestTenants(): Promise<TestTenancy> {
	const base = testDatabaseUrl(process.env);
	const registryUrl = withDatabase(base, TEST_TENANTS.registry);
	const template = withDatabase(base, TENANCY.template.placeholder).replace(
		encodeURIComponent(TENANCY.template.placeholder),
		TENANCY.template.placeholder,
	);

	await createDatabase(base, TEST_TENANTS.registry);
	for (const { dbName } of [TEST_TENANTS.a, TEST_TENANTS.b]) {
		await createDatabase(base, dbName);
		await migrate(withDatabase(base, dbName));
	}

	process.env.RELOOP_REGISTRY_URL = registryUrl;
	process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = template;
	forgetTenants();

	await ensureRegistrySchema();
	const a = await createTenant({
		id: TEST_TENANTS.a.id,
		slug: TEST_TENANTS.a.id,
		dbName: TEST_TENANTS.a.dbName,
		allowList: [TEST_TENANTS.a.domain],
		siteIds: [`site-${TEST_TENANTS.a.id}`],
	});
	const b = await createTenant({
		id: TEST_TENANTS.b.id,
		slug: TEST_TENANTS.b.id,
		dbName: TEST_TENANTS.b.dbName,
		allowList: [TEST_TENANTS.b.domain],
		siteIds: [`site-${TEST_TENANTS.b.id}`],
	});

	return { registryUrl, template, a, b };
}
