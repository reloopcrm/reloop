import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { disconnectAll } from "@crm/db/client";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants } from "@crm/db/test-tenants";
import { forgetInstall, readInstall, syncVersion } from "../src/install";

const runId = process.env.TEST_RUN_ID ?? "spec";

describe("the install row in hosted mode", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	let a: Tenant;
	let b: Tenant;

	beforeAll(async () => {
		({ a, b } = await prepareTestTenants());
		forgetInstall();
	});

	afterAll(async () => {
		forgetInstall();
		await disconnectAll();
		await closeRegistry();
		if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = saved.registry;
		if (saved.template === undefined)
			delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
		else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
	});

	it("remembers one row per tenant, never the neighbour's", async () => {
		const versionA = `a-${runId}`;
		const versionB = `b-${runId}`;

		const wroteA = await runAsTenant(a, () => syncVersion(versionA));
		const wroteB = await runAsTenant(b, () => syncVersion(versionB));
		const readA = await runAsTenant(a, () => readInstall());
		const readB = await runAsTenant(b, () => readInstall());

		expect(wroteA?.version).toBe(versionA);
		expect(wroteB?.version).toBe(versionB);
		expect(readA).toBe(wroteA);
		expect(readB).toBe(wroteB);
		expect(readA?.uuid).not.toBe(readB?.uuid);
	});
});
