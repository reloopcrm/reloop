import { afterEach, describe, expect, it } from "bun:test";
import { tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { API_KEY_PREFIX } from "../src/api-key-config";
import { generateApiKey } from "../src/api-keys";
import { tenantIdFromApiKey } from "../src/tenant-cookie";

const seam = tenant.parse({
	id: "seam1-keys",
	slug: "seam1-keys",
	dbName: "seam1_keys_test",
	plan: "trial",
	status: "active",
	aiMode: "operator",
	signIn: "google",
	createdAt: new Date("2026-09-21T00:00:00.000Z"),
	trialEndsAt: null,
	suspendedAt: null,
	deletedAt: null,
	allowList: ["seam1-keys.example"],
	paidUntil: null,
	graceUntil: null,
	billing: {},
});

describe("the tenant inside an api key", () => {
	const registry = process.env.RELOOP_REGISTRY_URL;

	afterEach(() => {
		if (registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = registry;
	});

	it("reads back the tenant a hosted key was made for", () => {
		process.env.RELOOP_REGISTRY_URL = "postgres://registry.invalid/registry";
		const key = runAsTenant(seam, () =>
			generateApiKey({ length: 32, prefix: undefined }),
		);

		expect(key.startsWith(`${API_KEY_PREFIX}${seam.id}_`)).toBe(true);
		expect(tenantIdFromApiKey(key)).toBe(seam.id);
	});

	it("finds no tenant in a self-hosted key", () => {
		delete process.env.RELOOP_REGISTRY_URL;
		const key = generateApiKey({ length: 32, prefix: API_KEY_PREFIX });

		expect(tenantIdFromApiKey(key)).toBeNull();
	});

	it("refuses a key that names no valid tenant", () => {
		for (const key of [
			undefined,
			"",
			"seam1-keys_abc",
			`${API_KEY_PREFIX}abc`,
			`${API_KEY_PREFIX}_abc`,
			`${API_KEY_PREFIX}Seam1_abc`,
			`${API_KEY_PREFIX}seam1.keys_abc`,
			`${API_KEY_PREFIX}s_abc`,
		]) {
			expect(tenantIdFromApiKey(key)).toBeNull();
		}
	});
});
