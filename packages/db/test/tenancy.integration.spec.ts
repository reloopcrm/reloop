import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { db, disconnectAll } from "../src/client";
import {
	closeRegistry,
	forEachTenant,
	forgetTenant,
	signInEntriesFor,
	type Tenant,
	tenantById,
	tenantBySignIn,
	tenantBySite,
} from "../src/tenancy";
import { currentTenant, runAsTenant } from "../src/tenant-context";
import { prepareTestTenants, TEST_TENANTS } from "../src/test-tenants";

const runId = process.env.TEST_RUN_ID ?? "spec";
const prefix = `tenancy-${runId}-`;

const ROWS = 50;

const PREPARE_TIMEOUT_MS = 120_000;

describe("two tenant databases behind one db", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	let a: Tenant;
	let b: Tenant;
	let registryUrl = "";

	const clean = (tenant: Tenant) =>
		runAsTenant(tenant, () =>
			db.company.deleteMany({ where: { name: { startsWith: prefix } } }),
		);

	beforeAll(async () => {
		({ a, b, registryUrl } = await prepareTestTenants());
		await Promise.all([clean(a), clean(b)]);
	}, PREPARE_TIMEOUT_MS);

	afterAll(async () => {
		await Promise.all([clean(a), clean(b)]);
		await disconnectAll();
		await closeRegistry();
		if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = saved.registry;
		if (saved.template === undefined)
			delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
	});

	it("finds a tenant by id, sign-in address, domain and site id", async () => {
		expect((await tenantById(a.id))?.dbName).toBe(TEST_TENANTS.a.dbName);
		expect(await tenantById("nobody")).toBeNull();
		expect(await tenantById("not_a_tenant")).toBeNull();

		expect((await tenantBySignIn(`rep@${TEST_TENANTS.b.domain}`))?.id).toBe(
			b.id,
		);
		expect(
			(await tenantBySignIn(`rep@mail.${TEST_TENANTS.a.domain}`))?.id,
		).toBe(a.id);
		expect(await tenantBySignIn("rep@nowhere.example")).toBeNull();

		expect((await tenantBySite(`site-${a.id}`))?.id).toBe(a.id);
		expect(await tenantBySite("site-nobody")).toBeNull();

		expect(signInEntriesFor("Rep@Mail.Acme.com")).toEqual([
			"rep@mail.acme.com",
			"mail.acme.com",
			"acme.com",
		]);
		expect(a.allowList).toEqual([TEST_TENANTS.a.domain]);
	});

	it("gives two interleaved contexts each their own database", async () => {
		const database = () =>
			db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;

		const [inA, inB] = await Promise.all([
			runAsTenant(a, async () => {
				const first = await database();
				await database();
				return [first[0]?.name, (await database())[0]?.name];
			}),
			runAsTenant(b, async () => {
				const first = await database();
				await database();
				return [first[0]?.name, (await database())[0]?.name];
			}),
		]);

		expect(inA).toEqual([TEST_TENANTS.a.dbName, TEST_TENANTS.a.dbName]);
		expect(inB).toEqual([TEST_TENANTS.b.dbName, TEST_TENANTS.b.dbName]);
	});

	it("writes 50 rows per tenant in parallel and none cross over", async () => {
		const write = (tenant: Tenant) =>
			runAsTenant(tenant, () =>
				Promise.all(
					Array.from({ length: ROWS }, (_, index) =>
						db.company.create({
							data: {
								name: `${prefix}${tenant.id}-${index}`,
								domain: `${index}.${tenant.id}.example`,
							},
						}),
					),
				),
			);

		await Promise.all([write(a), write(b)]);

		const names = (tenant: Tenant) =>
			runAsTenant(tenant, async () =>
				(
					await db.company.findMany({
						where: { name: { startsWith: prefix } },
						select: { name: true },
					})
				).map((row) => row.name),
			);

		const [inA, inB] = await Promise.all([names(a), names(b)]);

		expect(inA).toHaveLength(ROWS);
		expect(inB).toHaveLength(ROWS);
		expect(inA.every((name) => name.startsWith(`${prefix}${a.id}-`))).toBe(
			true,
		);
		expect(inB.every((name) => name.startsWith(`${prefix}${b.id}-`))).toBe(
			true,
		);
	});

	it("loops the cron work over every active tenant and survives one failing", async () => {
		const seen: string[] = [];

		const outcome = await forEachTenant(async () => {
			const tenant = currentTenant();
			seen.push(tenant.id);
			await db.$queryRaw`SELECT 1`;
			if (tenant.id === a.id) throw new Error("tenant a is on fire");
			return tenant.dbName;
		});

		expect(seen.sort()).toEqual([a.id, b.id].sort());
		expect(outcome).toEqual({
			tenants: [
				{ tenantId: a.id, ok: false, error: "tenant a is on fire" },
				{ tenantId: b.id, ok: true, result: TEST_TENANTS.b.dbName },
			],
		});
	});

	it("runs tenants in parallel and a hanging tenant never blocks the other", async () => {
		const started: string[] = [];
		const startedAt = Date.now();

		const outcome = await forEachTenant(
			async () => {
				const tenant = currentTenant();
				started.push(tenant.id);
				if (tenant.id === a.id) {
					await new Promise((resolve) => setTimeout(resolve, 2_000));
				}
				await db.$queryRaw`SELECT 1`;
				return tenant.dbName;
			},
			{ budgetMs: 300 },
		);

		expect(Date.now() - startedAt).toBeLessThan(1_500);
		expect(started.sort()).toEqual([a.id, b.id].sort());
		expect(outcome).toEqual({
			tenants: [
				{
					tenantId: a.id,
					ok: false,
					error: "Tenant budget of 300 ms exceeded",
				},
				{ tenantId: b.id, ok: true, result: TEST_TENANTS.b.dbName },
			],
		});
	});

	it("runs one tenant at a time when asked, in registry order", async () => {
		const order: string[] = [];

		await forEachTenant(
			async () => {
				order.push(`${currentTenant().id}:start`);
				await new Promise((resolve) => setTimeout(resolve, 20));
				order.push(`${currentTenant().id}:end`);
			},
			{ concurrency: 1 },
		);

		expect(order).toEqual([
			`${a.id}:start`,
			`${a.id}:end`,
			`${b.id}:start`,
			`${b.id}:end`,
		]);
	});

	it("forgets a cached tenant so a status change shows at once", async () => {
		const registry = new pg.Client({ connectionString: registryUrl });
		await registry.connect();

		try {
			expect((await tenantById(a.id))?.status).toBe("active");

			await registry.query(
				"UPDATE tenant SET status = 'suspended' WHERE id = $1",
				[a.id],
			);
			expect((await tenantById(a.id))?.status).toBe("active");

			forgetTenant(a.id);
			expect((await tenantById(a.id))?.status).toBe("suspended");
			expect(
				(await forEachTenant(async () => currentTenant().id)) as unknown,
			).toEqual({
				tenants: [{ tenantId: b.id, ok: true, result: b.id }],
			});
		} finally {
			await registry.query(
				"UPDATE tenant SET status = 'active' WHERE id = $1",
				[a.id],
			);
			forgetTenant(a.id);
			await registry.end();
		}
	});
});
