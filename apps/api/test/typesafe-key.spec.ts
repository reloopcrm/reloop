import { describe, expect, it } from "bun:test";
import type { WorkspaceRole } from "@crm/auth";
import type { Db } from "@crm/db";
import { openTypesafeKey, sealTypesafeKey, TYPESAFE } from "@crm/db/typesafe";
import type { AgentAccessService } from "../src/agent/agent-access.service";
import { typesafeStatusOutput } from "../src/typesafe/typesafe.contracts";
import { TypesafeService } from "../src/typesafe/typesafe.service";

const KEY = "ts-live-0123456789abcdef";

function service(role: WorkspaceRole, stored: string | null) {
	const written: (string | null)[] = [];

	const db = {
		appSetting: {
			findUnique: async () => ({ typesafeApiKey: stored }),
			upsert: async ({
				update,
			}: {
				update: { typesafeApiKey: string | null };
			}) => {
				written.push(update.typesafeApiKey);
				return {};
			},
		},
	} as unknown as Db;

	const access = {
		assertMember: async () => role,
	} as unknown as AgentAccessService;

	return { service: new TypesafeService(db, access), written };
}

describe("the TypeSafe key is sealed", () => {
	it("round trips through the seal", () => {
		const sealed = sealTypesafeKey(KEY);

		expect(sealed).not.toContain(KEY);
		expect(openTypesafeKey(sealed)).toBe(KEY);
	});

	it("seals the key before it is written", async () => {
		const { service: typesafe, written } = service("owner", null);

		await typesafe.save("u1", { apiKey: KEY });

		expect(written[0]).toBeTruthy();
		expect(written[0]).not.toContain(KEY);
		expect(openTypesafeKey(String(written[0]))).toBe(KEY);
	});

	it("deletes the key on disconnect", async () => {
		const { service: typesafe, written } = service("owner", null);

		await typesafe.disconnect("u1");

		expect(written[0]).toBeNull();
	});
});

describe("the key never leaves the API in plain text", () => {
	it("gives an admin a masked hint only", async () => {
		const { service: typesafe } = service("admin", sealTypesafeKey(KEY));
		const status = await typesafe.status("u1");

		expect(status.connected).toBe(true);
		expect(status.keyHint).toBeTruthy();
		expect(JSON.stringify(status)).not.toContain(KEY);
	});

	it("gives a member no hint at all", async () => {
		const { service: typesafe } = service("member", sealTypesafeKey(KEY));
		const status = await typesafe.status("u1");

		expect(status.canManage).toBe(false);
		expect(status.keyHint).toBeNull();
		expect(status.connected).toBe(true);
	});

	it("refuses a member who tries to save one", async () => {
		const { service: typesafe, written } = service("member", null);

		await expect(typesafe.save("u1", { apiKey: KEY })).rejects.toThrow();
		expect(written).toHaveLength(0);
	});

	it("declares no field that could hold a key", () => {
		expect(Object.keys(typesafeStatusOutput.shape).sort()).toEqual([
			"canManage",
			"connected",
			"keyHint",
		]);
	});

	it("keeps the gate conservative", () => {
		expect(TYPESAFE.gate.threshold).toBe(0.2);
	});
});
