import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { disconnectAll } from "@crm/db/client";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import {
	currentTenant,
	runAsTenant,
	TenantContextMissing,
} from "@crm/db/tenant-context";
import { prepareTestTenants } from "@crm/db/test-tenants";
import { dispatchHealth, drainAll } from "../agent/lib/dispatch";
import { claimDue } from "../agent/lib/tasks";
import {
	eachActiveTenant,
	tenantAttributes,
	tenantState,
	withTenant,
} from "../agent/lib/tenant";

const runId = process.env.TEST_RUN_ID ?? "spec";
const reason = `tenant-lanes-${runId}-${crypto.randomUUID().slice(0, 8)}`;
const ROWS = 5;

describe("two tenants through the agent lanes", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	let a: Tenant;
	let b: Tenant;

	const clean = (tenant: Tenant) =>
		runAsTenant(tenant, () => db.agentTask.deleteMany({ where: { reason } }));

	beforeAll(async () => {
		({ a, b } = await prepareTestTenants());
		await Promise.all([clean(a), clean(b)]);
	});

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

	const seed = (tenant: Tenant, kind: string) =>
		runAsTenant(tenant, () =>
			db.agentTask.createMany({
				data: Array.from({ length: ROWS }, () => ({
					kind,
					reason,
					dueAt: new Date(Date.now() - 1_000),
					priority: 1_000_000,
					budget: 1,
				})),
			}),
		);

	it("refuses a database call without a tenant in hosted mode", () => {
		expect(() => db.agentTask).toThrow(TenantContextMissing);
	});

	it("claims each tenant's rows inside that tenant, in parallel", async () => {
		await Promise.all([seed(a, "identify"), seed(b, "identify")]);

		const claimedIn = (tenant: Tenant) =>
			runAsTenant(tenant, async () => {
				const rows = await claimDue(50, { only: ["identify"] });
				return rows.filter((row) => row.reason === reason);
			});

		const [inA, inB] = await Promise.all([claimedIn(a), claimedIn(b)]);
		const idsA = new Set(inA.map((row) => row.id));

		expect(inA).toHaveLength(ROWS);
		expect(inB).toHaveLength(ROWS);
		expect(inB.some((row) => idsA.has(row.id))).toBe(false);

		const stillOpen = (tenant: Tenant) =>
			runAsTenant(tenant, () =>
				db.agentTask.count({ where: { reason, leasedUntil: null } }),
			);
		expect(await stillOpen(a)).toBe(0);
		expect(await stillOpen(b)).toBe(0);
	});

	it("drains both tenants at once and keeps the health counters apart", async () => {
		await Promise.all([clean(a), clean(b)]);
		await Promise.all([seed(a, "usage-probe"), seed(b, "usage-probe")]);

		const startedAt: Record<string, string | null> = {};
		const outcomes = await eachActiveTenant("lane test", async (tenant) => {
			expect(tenantAttributes()).toEqual({ tenantId: tenant?.id ?? "" });
			await drainAll(async () => ({ id: "never" }));
			startedAt[tenant?.id ?? ""] = dispatchHealth().startedAt;
		});

		expect(outcomes.map((entry) => entry.ok)).toEqual([true, true]);

		const finished = (tenant: Tenant) =>
			runAsTenant(tenant, () =>
				db.agentTask.count({ where: { reason, finishedAt: { not: null } } }),
			);
		expect(await finished(a)).toBe(ROWS);
		expect(await finished(b)).toBe(ROWS);
		expect(startedAt[a.id]).toBeString();
		expect(startedAt[b.id]).toBeString();
	});

	it("goes on with the other tenants when one fails", async () => {
		const seen: string[] = [];
		const outcomes = await eachActiveTenant("failing test", async (tenant) => {
			if (tenant?.id === a.id) throw new Error("tenant a is broken");
			seen.push(currentTenant().id);
		});

		expect(seen).toEqual([b.id]);
		expect(outcomes.find((entry) => entry.tenantId === a.id)).toMatchObject({
			ok: false,
			error: "tenant a is broken",
		});
		expect(outcomes.find((entry) => entry.tenantId === b.id)?.ok).toBe(true);
	});

	it("keeps module state per tenant and reads the tenant from the session", async () => {
		const counter = tenantState(() => ({ value: 0 }));

		await runAsTenant(a, async () => {
			counter().value += 2;
		});

		const inB = await runAsTenant(b, async () => counter().value);
		const inA = await runAsTenant(a, async () => counter().value);
		expect([inA, inB]).toEqual([2, 0]);

		const session = (tenantId: string | undefined) => ({
			session: {
				auth: {
					current: tenantId ? { attributes: { tenantId } } : null,
					initiator: null,
				},
			},
		});

		expect(await withTenant(session(b.id), () => currentTenant().id)).toBe(
			b.id,
		);
		await expect(withTenant(session(undefined), () => 1)).rejects.toThrow(
			"names no tenant",
		);
		await expect(withTenant(session("nobody"), () => 1)).rejects.toThrow(
			"unknown",
		);
	});
});
