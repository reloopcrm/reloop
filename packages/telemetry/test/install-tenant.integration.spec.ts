import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { disconnectAll } from "@crm/db/client";
import type { Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { databaseName, testDatabaseUrl } from "@crm/db/test-database";
import { forgetInstall, readInstall, syncVersion } from "../src/install";

const runId = process.env.TEST_RUN_ID ?? "spec";

const tenantOf = (id: string, dbName: string): Tenant => ({
	id,
	slug: id,
	dbName,
	plan: "trial",
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date("2026-09-21T00:00:00.000Z"),
	trialEndsAt: null,
	deletedAt: null,
	allowList: [`${id}.example`],
});

describe("the install cache in hosted mode", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	const url = testDatabaseUrl(process.env);
	const shared = databaseName(url);
	const a = tenantOf(`install-a-${runId}`, shared);
	const b = tenantOf(`install-b-${runId}`, shared);
	let before: string | undefined;

	beforeAll(async () => {
		before = (await readInstall())?.version;
		forgetInstall();
		process.env.RELOOP_REGISTRY_URL = "postgresql://unused/registry";
		process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = url.replace(
			`/${shared}`,
			"/{db}",
		);
	});

	afterAll(async () => {
		if (before) await runAsTenant(a, () => syncVersion(before));
		await disconnectAll();
		forgetInstall();
		if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = saved.registry;
		if (saved.template === undefined)
			delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
	});

	it("remembers one row per tenant, never the neighbour's", async () => {
		const wroteA = await runAsTenant(a, () => syncVersion(`a-${runId}`));
		const readB = await runAsTenant(b, () => readInstall());
		const readA = await runAsTenant(a, () => readInstall());
		const readBAgain = await runAsTenant(b, () => readInstall());

		expect(wroteA?.version).toBe(`a-${runId}`);
		expect(readA).toBe(wroteA);
		expect(readB).not.toBe(wroteA);
		expect(readBAgain).toBe(readB);
	});

	it("answers null outside a tenant context instead of throwing", async () => {
		expect(await readInstall()).toBeNull();
	});
});
