import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import pg from "pg";
import { db, disconnectTenant } from "./client";
import { TRIAL_DAYS } from "./plans";
import { writePlan } from "./settings";
import {
	allTenants,
	createTenant,
	ensureRegistrySchema,
	type NewTenant,
	removeTenant,
	setTenantStatus,
	type Tenant,
	tenantById,
	tenantDatabaseUrl,
} from "./tenancy";
import { TENANCY } from "./tenancy-config";
import { runAsTenant } from "./tenant-context";
import { databaseName, isTestDatabaseName } from "./test-database";
import { WORKSPACE_ID, workspaceSlug } from "./workspace";

const DB_DIR = dirname(import.meta.dirname);
const MIGRATIONS = join(DB_DIR, "prisma", "migrations");
const DAY_MS = 24 * 60 * 60_000;

export class DumpUnavailable extends Error {
	constructor(reason: string) {
		super(`pg_dump did not run: ${reason}`);
		this.name = "DumpUnavailable";
	}
}

function maintenanceUrl(url: string): string {
	const parsed = new URL(url);
	parsed.pathname = "/postgres";
	parsed.search = "";
	return parsed.toString();
}

function refuseOutsideTests(name: string): void {
	if (process.env.NODE_ENV === "test" && !isTestDatabaseName(name)) {
		throw new Error(
			`${name} does not end in _test. The test run refuses to create or drop it.`,
		);
	}
}

async function withMaintenance<T>(
	url: string,
	fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
	const client = new pg.Client({ connectionString: maintenanceUrl(url) });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

export async function createDatabase(url: string): Promise<boolean> {
	const name = databaseName(url);
	refuseOutsideTests(name);
	return withMaintenance(url, async (client) => {
		const existing = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[name],
		);
		if (existing.rowCount) return false;
		await client.query(`CREATE DATABASE "${name}"`);
		return true;
	});
}

export async function dropDatabase(url: string): Promise<void> {
	const name = databaseName(url);
	refuseOutsideTests(name);
	await withMaintenance(url, async (client) => {
		await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	});
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

export async function migrateDatabase(url: string): Promise<boolean> {
	const onDisk = existsSync(MIGRATIONS)
		? readdirSync(MIGRATIONS, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
		: [];
	const applied = await appliedMigrations(url);
	if (onDisk.every((name) => applied.has(name))) return false;

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
	return true;
}

function pgToolUrl(url: string): string {
	const parsed = new URL(url);
	parsed.searchParams.delete("schema");
	return parsed.toString();
}

export function dumpDatabase(url: string, dir: string): Promise<string> {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const file = join(dir, `${databaseName(url)}-${stamp}.dump`);
	mkdirSync(dir, { recursive: true });

	return new Promise((resolve, reject) => {
		const child = spawn(
			"pg_dump",
			["--format=custom", "--no-owner", `--file=${file}`, pgToolUrl(url)],
			{
				stdio: ["ignore", "ignore", "pipe"],
				timeout: TENANCY.backup.dumpTimeoutMs,
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => reject(new DumpUnavailable(error.message)));
		child.on("close", (code) => {
			if (code === 0) resolve(file);
			else reject(new DumpUnavailable(stderr.trim() || `exit code ${code}`));
		});
	});
}

export function dbNameOf(tenantId: string): string {
	const suffix = process.env.NODE_ENV === "test" ? "_test" : "";
	return `${TENANCY.names.dbPrefix}${tenantId.replaceAll("-", "_")}${suffix}`;
}

export function trialEndsAfter(now: Date): Date {
	return new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
}

export async function provisionTenant(input: NewTenant): Promise<Tenant> {
	const url = tenantDatabaseUrl(input.dbName);
	const plan = input.plan ?? "trial";
	const trialEndsAt =
		input.trialEndsAt !== undefined
			? input.trialEndsAt
			: plan === "trial"
				? trialEndsAfter(new Date())
				: null;

	await ensureRegistrySchema();
	const existed = (await tenantById(input.id)) !== null;
	const created = await createDatabase(url);
	if (!existed && !created) {
		throw new Error(
			`Database ${input.dbName} exists but tenant ${input.id} is not in the registry. Drop the database or register it by hand.`,
		);
	}

	try {
		await migrateDatabase(url);
		const tenant = await createTenant({ ...input, plan, trialEndsAt });
		await runAsTenant(tenant, async () => {
			await writePlan(db, plan);
			if (input.name) await nameWorkspace(input.name);
		});
		return tenant;
	} catch (error) {
		await disconnectTenant(input.id);
		if (!existed) await removeTenant(input.id).catch(() => undefined);
		if (created) await dropDatabase(url).catch(() => undefined);
		throw error;
	}
}

async function nameWorkspace(name: string): Promise<void> {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name,
			slug: workspaceSlug(name),
			createdAt: new Date(),
		},
		update: {},
	});
}

export async function migrateTenant(tenant: Tenant): Promise<boolean> {
	return migrateDatabase(tenantDatabaseUrl(tenant.dbName));
}

export type MigrationOutcome =
	| { tenantId: string; ok: true; migrated: boolean }
	| { tenantId: string; ok: false; error: string };

export async function migrateAllTenants(): Promise<MigrationOutcome[]> {
	const registryUrl = process.env.RELOOP_REGISTRY_URL;
	if (registryUrl) await createDatabase(registryUrl);
	await ensureRegistrySchema();
	const outcomes: MigrationOutcome[] = [];

	for (const tenant of await allTenants()) {
		try {
			const migrated = await migrateTenant(tenant);
			if (tenant.status === "migration_failed") {
				await setTenantStatus(tenant.id, "active");
			}
			outcomes.push({ tenantId: tenant.id, ok: true, migrated });
		} catch (error) {
			await setTenantStatus(tenant.id, "migration_failed").catch(
				() => undefined,
			);
			outcomes.push({
				tenantId: tenant.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return outcomes;
}

export function recentDump(dbName: string, dir: string): string | null {
	if (!existsSync(dir)) return null;
	const freshAfter = Date.now() - TENANCY.backup.recentDumpMs;
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((file) => {
			const base = file.split("/").pop() ?? "";
			return base.startsWith(`${dbName}-`) && /\.(dump|sql\.gz)$/.test(base);
		})
		.map((file) => join(dir, file))
		.filter((file) => statSync(file).mtimeMs >= freshAfter)
		.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
	return files[0] ?? null;
}

async function dumpBeforeDrop(
	tenant: Tenant,
	url: string,
	dumpDir: string,
): Promise<string> {
	try {
		return await dumpDatabase(url, dumpDir);
	} catch (error) {
		const recent = recentDump(tenant.dbName, dumpDir);
		if (recent) return recent;
		throw error;
	}
}

export async function deleteTenant(
	tenant: Tenant,
	options: { dumpDir: string | null },
): Promise<{ dump: string | null }> {
	const url = tenantDatabaseUrl(tenant.dbName);
	let dump: string | null = null;

	if (tenant.status !== "pending") {
		if (!options.dumpDir) {
			throw new DumpUnavailable(
				"RELOOP_BACKUP_DIR is not set, and a tenant with data is only dropped after a dump.",
			);
		}
		dump = await dumpBeforeDrop(tenant, url, options.dumpDir);
	}

	await disconnectTenant(tenant.id);
	await dropDatabase(url);
	await removeTenant(tenant.id);

	return { dump };
}
