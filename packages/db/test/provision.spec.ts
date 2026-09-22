import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { db, disconnectAll } from "../src/client";
import { TRIAL_DAYS } from "../src/plans";
import {
	createDatabase,
	dbNameOf,
	deleteTenant,
	dropDatabase,
	migrateAllTenants,
	provisionTenant,
	recentDump,
} from "../src/provision";
import { readPlan } from "../src/settings";
import {
	closeRegistry,
	removeTenant,
	tenantById,
	tenantDatabaseUrl,
} from "../src/tenancy";
import { runAsTenant } from "../src/tenant-context";
import { prepareTestTenants } from "../src/test-tenants";
import { WORKSPACE_ID } from "../src/workspace";

const runId = (process.env.TEST_RUN_ID ?? "spec")
	.toLowerCase()
	.replace(/[^a-z0-9]/g, "");
const DAY_MS = 24 * 60 * 60_000;

const ids = {
	pending: `prov-${runId}`,
	broken: `prov-broken-${runId}`,
	active: `prov-active-${runId}`,
};

async function databaseExists(name: string): Promise<boolean> {
	const url = new URL(tenantDatabaseUrl(name));
	url.pathname = "/postgres";
	const client = new pg.Client({ connectionString: url.toString() });
	await client.connect();
	try {
		const found = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[name],
		);
		return (found.rowCount ?? 0) > 0;
	} finally {
		await client.end();
	}
}

describe("provisionTenant", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	const dumpDir = mkdtempSync(join(tmpdir(), "reloop-dump-"));

	const wipe = async (id: string) => {
		await removeTenant(id).catch(() => undefined);
		await dropDatabase(tenantDatabaseUrl(dbNameOf(id))).catch(() => undefined);
	};

	beforeAll(async () => {
		await prepareTestTenants();
		for (const id of Object.values(ids)) await wipe(id);
	});

	afterAll(async () => {
		await disconnectAll();
		for (const id of Object.values(ids)) await wipe(id);
		rmSync(dumpDir, { recursive: true, force: true });
		await closeRegistry();
		if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = saved.registry;
		if (saved.template === undefined)
			delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
	});

	it("creates, migrates, registers and sets the trial, twice without harm", async () => {
		const before = Date.now();
		const tenant = await provisionTenant({
			id: ids.pending,
			slug: ids.pending,
			dbName: dbNameOf(ids.pending),
			allowList: [`owner@${ids.pending}.example`],
			status: "pending",
			name: "Musterpack GmbH",
		});

		expect(tenant.status).toBe("pending");
		expect(tenant.plan).toBe("trial");
		expect(
			await runAsTenant(tenant, () =>
				db.organization.findUnique({
					where: { id: WORKSPACE_ID },
					select: { name: true, slug: true },
				}),
			),
		).toEqual({ name: "Musterpack GmbH", slug: "musterpack-gmbh" });
		expect(tenant.dbName.endsWith("_test")).toBe(true);
		const trialEnds = tenant.trialEndsAt?.getTime() ?? 0;
		expect(trialEnds).toBeGreaterThanOrEqual(before + TRIAL_DAYS * DAY_MS);
		expect(trialEnds).toBeLessThan(before + (TRIAL_DAYS + 1) * DAY_MS);
		expect(await databaseExists(tenant.dbName)).toBe(true);
		expect(await runAsTenant(tenant, () => readPlan(db))).toBe("trial");

		const again = await provisionTenant({
			id: ids.pending,
			slug: ids.pending,
			dbName: dbNameOf(ids.pending),
			allowList: [`owner@${ids.pending}.example`],
			status: "pending",
		});
		expect(again.id).toBe(tenant.id);
		expect(again.status).toBe("pending");

		const outcomes = await migrateAllTenants();
		expect(outcomes.find((row) => row.tenantId === tenant.id)).toEqual({
			tenantId: tenant.id,
			ok: true,
			migrated: false,
		});
	}, 120_000);

	it("leaves no half tenant when the registry write fails", async () => {
		await expect(
			provisionTenant({
				id: ids.broken,
				slug: ids.pending,
				dbName: dbNameOf(ids.broken),
				allowList: [`owner@${ids.broken}.example`],
			}),
		).rejects.toThrow();

		expect(await tenantById(ids.broken)).toBeNull();
		expect(await databaseExists(dbNameOf(ids.broken))).toBe(false);
	}, 120_000);

	it("drops a pending tenant without a dump, and dumps an active one first", async () => {
		const pending = await tenantById(ids.pending);
		if (!pending) throw new Error("the pending tenant is missing");
		expect(await deleteTenant(pending, { dumpDir: null })).toEqual({
			dump: null,
		});
		expect(await tenantById(ids.pending)).toBeNull();
		expect(await databaseExists(pending.dbName)).toBe(false);

		const active = await provisionTenant({
			id: ids.active,
			slug: ids.active,
			dbName: dbNameOf(ids.active),
			allowList: [`${ids.active}.example`],
		});
		expect(active.status).toBe("active");
		await expect(deleteTenant(active, { dumpDir: null })).rejects.toThrow(
			/RELOOP_BACKUP_DIR/,
		);
		expect(await databaseExists(active.dbName)).toBe(true);

		const nightly = join(dumpDir, "daily");
		mkdirSync(nightly, { recursive: true });
		writeFileSync(join(nightly, `${active.dbName}-nightly.sql.gz`), "x");
		const { dump } = await deleteTenant(active, { dumpDir });
		expect(dump).not.toBeNull();
		expect(existsSync(dump ?? "")).toBe(true);
		expect(await tenantById(ids.active)).toBeNull();
		expect(await databaseExists(active.dbName)).toBe(false);
	}, 120_000);

	it("finds a fresh nightly dump for a database, and ignores others", () => {
		const nightly = join(dumpDir, "daily");
		mkdirSync(nightly, { recursive: true });
		writeFileSync(join(nightly, "crm_acme-2026-09-21.sql.gz"), "x");
		writeFileSync(join(nightly, "crm_acme_two-2026-09-21.sql.gz"), "x");

		expect(recentDump("crm_acme", dumpDir)).toBe(
			join(nightly, "crm_acme-2026-09-21.sql.gz"),
		);
		expect(recentDump("crm_nobody", dumpDir)).toBeNull();
		expect(recentDump("crm_acme", join(dumpDir, "missing"))).toBeNull();
	});

	it("refuses a database outside _test during a test run", async () => {
		await expect(
			createDatabase(tenantDatabaseUrl("crm_not_a_test_database")),
		).rejects.toThrow(/_test/);
	});
});
