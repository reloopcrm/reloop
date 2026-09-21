import { afterEach, describe, expect, it } from "bun:test";
import { db } from "../src/client";
import type { Tenant } from "../src/tenancy";
import {
	currentTenant,
	runAsTenant,
	TenantContextMissing,
	tenantScopedKey,
} from "../src/tenant-context";

const tenantOf = (id: string): Tenant => ({
	id,
	slug: id,
	dbName: `${id}_test`,
	plan: "trial",
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date("2026-09-21T00:00:00.000Z"),
	trialEndsAt: null,
	deletedAt: null,
	allowList: [`${id}.example`],
});

const A = tenantOf("spike-a");
const B = tenantOf("spike-b");

const query = () => db.$queryRaw`SELECT 1`;

async function* pagedIds(): AsyncGenerator<string> {
	for (let page = 0; page < 3; page += 1) {
		await query();
		yield currentTenant().id;
	}
}

describe("the tenant context under Bun", () => {
	const registry = process.env.RELOOP_REGISTRY_URL;

	afterEach(() => {
		if (registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = registry;
	});

	it("survives a $transaction callback", async () => {
		const seen = await runAsTenant(A, () =>
			db.$transaction(async (tx) => {
				await tx.$queryRaw`SELECT 1`;
				return currentTenant().id;
			}),
		);

		expect(seen).toBe(A.id);
	});

	it("survives an async generator that queries between yields", async () => {
		const seen = await runAsTenant(A, async () => {
			const ids: string[] = [];
			for await (const id of pagedIds()) ids.push(id);
			return ids;
		});

		expect(seen).toEqual([A.id, A.id, A.id]);
	});

	it("survives detached void (async () => …)() work", async () => {
		const seen = new Promise<string>((resolve, reject) => {
			runAsTenant(A, () => {
				void (async () => {
					try {
						await query();
						await query();
						resolve(currentTenant().id);
					} catch (error) {
						reject(error);
					}
				})();
			});
		});

		expect(await seen).toBe(A.id);
	});

	it("survives a .then chain", async () => {
		const seen = await runAsTenant(A, () =>
			query()
				.then(() => query())
				.then(() => currentTenant().id),
		);

		expect(seen).toBe(A.id);
	});

	it("keeps two interleaved contexts apart", async () => {
		const trace = async (tenant: Tenant) =>
			runAsTenant(tenant, async () => {
				const ids: string[] = [];
				for (let step = 0; step < 5; step += 1) {
					await query();
					ids.push(currentTenant().id);
				}
				return ids;
			});

		const [a, b] = await Promise.all([trace(A), trace(B)]);

		expect(a).toEqual(Array(5).fill(A.id));
		expect(b).toEqual(Array(5).fill(B.id));
	});

	it("throws outside a context, and only in hosted mode", () => {
		expect(() => currentTenant()).toThrow(TenantContextMissing);
		expect(tenantScopedKey("cache:key")).toBe("cache:key");

		process.env.RELOOP_REGISTRY_URL = "postgresql://registry.invalid/registry";

		expect(() => db.user).toThrow(TenantContextMissing);
		expect(() => tenantScopedKey("cache:key")).toThrow(TenantContextMissing);
		expect(runAsTenant(A, () => tenantScopedKey("cache:key"))).toBe(
			`${A.id}:cache:key`,
		);
	});
});
