import { afterEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import type { WorkspaceScope } from "../src/cloud/contract";
import { cloud } from "../src/cloud/scope";
import { PAID_PLAN_IDS } from "../src/pricing";
import { forEachTenant, type Tenant, tenant } from "../src/tenancy";
import { TENANCY } from "../src/tenancy-config";
import { disconnectTenant } from "../src/tenant-clients";
import {
	currentTenantId,
	isHosted,
	isHostedCustomer,
	operatorTenantId,
	runAsTenant,
	TenantContextMissing,
	tenantHeld,
	tenantScopedKey,
} from "../src/tenant-context";

const tenantNamed = (id: string, dbName: string): Tenant =>
	tenant.parse({ ...seamRow, id, slug: id, dbName });

const seamRow = {
	id: "seam1-a",
	slug: "seam1-a",
	dbName: "seam1_a_test",
	plan: "trial",
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date("2026-09-21T00:00:00.000Z"),
	trialEndsAt: new Date("2026-10-05T00:00:00.000Z"),
	suspendedAt: null,
	deletedAt: null,
	allowList: ["seam1-a.example"],
	paidUntil: null,
	graceUntil: null,
	billing: {
		status: "none",
		addOns: { research: 2 },
		wanted: { plan: PAID_PLAN_IDS[0], interval: "month" },
		scheduledTarget: {
			plan: null,
			interval: null,
			addOns: {},
			storedAt: new Date("2026-09-22T00:00:00.000Z"),
		},
	},
};

const seam = tenant.parse(seamRow);

type FakeClient = { url: string; $disconnect: () => Promise<void> };

const fakeCreate = (url: string) =>
	({ url, $disconnect: async () => {} }) satisfies FakeClient as unknown as Db;

const urlHere = () =>
	(
		cloud.resolveClient(
			() => fakeCreate("single"),
			fakeCreate,
		) as unknown as FakeClient
	).url;

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("the cloud slot delegates to the tenancy", () => {
	const registry = process.env.RELOOP_REGISTRY_URL;
	const operator = process.env.RELOOP_OPERATOR_TENANT;
	const template = process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;

	afterEach(() => {
		if (template === undefined)
			delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = template;
		if (registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = registry;
		if (operator === undefined) delete process.env.RELOOP_OPERATOR_TENANT;
		else process.env.RELOOP_OPERATOR_TENANT = operator;
	});

	it("answers hosted, customer and operator like the tenant context", () => {
		for (const url of [undefined, "postgres://registry.invalid/registry"]) {
			if (url === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = url;
			process.env.RELOOP_OPERATOR_TENANT = seam.id;

			expect(cloud.hosted()).toBe(isHosted());
			expect(cloud.operatorId()).toBe(operatorTenantId());
			runAsTenant(seam, () => {
				expect(cloud.customer()).toBe(isHostedCustomer());
				expect(cloud.scopeId()).toBe(currentTenantId());
				expect(cloud.scopedKey("k")).toBe(tenantScopedKey("k"));
			});
		}
	});

	it("shows the workspace scope, not the tenant row", () => {
		process.env.RELOOP_REGISTRY_URL = "postgres://registry.invalid/registry";
		const scope = runAsTenant(seam, () => cloud.current());

		expect(scope.id).toBe(seam.id);
		expect(scope.plan).toBe(seam.plan);
		expect(runAsTenant(seam, () => cloud.addOns())).toEqual(
			seam.billing.addOns,
		);
		expect(scope.trialEndsAt).toEqual(seam.trialEndsAt);
		expect(() => cloud.current()).toThrow(TenantContextMissing);
	});

	it("runs a scope as its tenant and holds it", async () => {
		process.env.RELOOP_REGISTRY_URL = "postgres://registry.invalid/registry";
		const scope = runAsTenant(seam, () => cloud.current());
		let finish = () => {};
		const work = cloud.run(scope, () => {
			const inside = currentTenantId();
			return new Promise<string | null>((resolve) => {
				finish = () => resolve(inside);
			});
		});

		expect(tenantHeld(seam.id)).toBe(true);
		finish();
		expect(await work).toBe(seam.id);
		expect(tenantHeld(seam.id)).toBe(false);
	});

	it("refuses to run a scope the tenancy did not make", () => {
		const { id, slug, plan, allowList, createdAt, trialEndsAt } = seam;
		const foreign = {
			id,
			slug,
			plan,
			allowList,
			createdAt,
			trialEndsAt,
		} as unknown as WorkspaceScope;

		expect(() => cloud.run(foreign, () => 1)).toThrow();
	});

	it("loops through forEachTenant and reads its budget", async () => {
		delete process.env.RELOOP_REGISTRY_URL;

		expect(cloud.forEachScope).toBe(forEachTenant);
		expect(await cloud.forEachScope(async () => "single")).toBe("single");
		expect(cloud.loop.budgetMs).toBe(TENANCY.loop.budgetMs);
		expect(cloud.backup.retentionDays).toBe(TENANCY.backup.retentionDays);
	});

	it("gives two tenants running at once their own client and database", async () => {
		process.env.RELOOP_REGISTRY_URL = "postgres://registry.invalid/registry";
		process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = `postgres://nobody@db.invalid/${TENANCY.template.placeholder}`;
		const scopeFor = (id: string, dbName: string) =>
			runAsTenant(tenantNamed(id, dbName), () => cloud.current());
		const a = scopeFor("seam1-run-a", "seam1_run_a_test");
		const b = scopeFor("seam1-run-b", "seam1_run_b_test");

		try {
			const seen = await Promise.all(
				[a, b, a, b].map((scope) =>
					cloud.run(scope, async () => {
						const before = urlHere();
						await pause();
						const nested = await cloud.run(scope === a ? b : a, async () => {
							await pause();
							return urlHere();
						});
						await pause();
						return { id: cloud.scopeId(), before, nested, after: urlHere() };
					}),
				),
			);

			for (const entry of seen) {
				const own = entry.id === a.id ? "seam1_run_a_test" : "seam1_run_b_test";
				const other =
					entry.id === a.id ? "seam1_run_b_test" : "seam1_run_a_test";
				expect(entry.before).toEndWith(`/${own}`);
				expect(entry.after).toEndWith(`/${own}`);
				expect(entry.nested).toEndWith(`/${other}`);
			}
			expect(seen.map((entry) => entry.id)).toEqual([a.id, b.id, a.id, b.id]);
			expect(cloud.run(a, urlHere)).toBe(cloud.run(a, urlHere));
			expect(cloud.run(a, urlHere)).not.toBe(cloud.run(b, urlHere));
		} finally {
			await disconnectTenant(a.id);
			await disconnectTenant(b.id);
		}
	});
});
