import pg from "pg";
import { createDatabase, migrateDatabase } from "./provision";
import {
	createTenant,
	ensureRegistrySchema,
	forgetTenants,
	type Tenant,
} from "./tenancy";
import { TENANCY } from "./tenancy-config";
import { isTestDatabaseName, testDatabaseUrl } from "./test-database";

export const PREPARE_TIMEOUT_MS = 120_000;

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

async function createTestDatabase(url: string, name: string): Promise<void> {
	if (!isTestDatabaseName(name)) {
		throw new Error(`${name} does not end in _test. Refusing to create it.`);
	}
	await createDatabase(withDatabase(url, name));
}

export async function prepareTestTenants(): Promise<TestTenancy> {
	const base = testDatabaseUrl(process.env);
	const registryUrl = withDatabase(base, TEST_TENANTS.registry);
	const template = withDatabase(base, TENANCY.template.placeholder).replace(
		encodeURIComponent(TENANCY.template.placeholder),
		TENANCY.template.placeholder,
	);

	await createTestDatabase(base, TEST_TENANTS.registry);
	for (const { dbName } of [TEST_TENANTS.a, TEST_TENANTS.b]) {
		await createTestDatabase(base, dbName);
		await migrateDatabase(withDatabase(base, dbName));
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

export async function registryQuery(
	sql: string,
	values: readonly string[],
): Promise<void> {
	const client = new pg.Client({
		connectionString: process.env.RELOOP_REGISTRY_URL,
	});
	await client.connect();
	try {
		await client.query(sql, [...values]);
	} finally {
		await client.end();
	}
}
