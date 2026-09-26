import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import type { AgentAccessService } from "../src/agent/agent-access.service";
import { OAuthAppsService } from "../src/oauth-apps/oauth-apps.service";

let writes = 0;

const db = {
	appSetting: {
		findUnique: async () => ({
			microsoftClientId: "stored-id",
			microsoftClientSecret: "stored-secret",
		}),
		upsert: async () => {
			writes += 1;
			return {};
		},
	},
} as unknown as Db;

const access = {
	assertMember: async () => "owner",
} as unknown as AgentAccessService;

const service = new OAuthAppsService(db, access);

describe("the sign-in credentials on Reloop Cloud", () => {
	const registry = process.env.RELOOP_REGISTRY_URL;

	beforeEach(() => {
		writes = 0;
		process.env.RELOOP_REGISTRY_URL = "postgres://registry.invalid/registry";
	});

	afterEach(() => {
		if (registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = registry;
	});

	it("shows a workspace owner no client ID and no secret", async () => {
		const status = await service.status("user-1", { provider: "microsoft" });

		expect(status.hosted).toBe(true);
		expect(status.canManage).toBe(false);
		expect(status.clientId).toBeNull();
		expect(status.secretHint).toBeNull();
		expect(status.tenantId).toBeNull();
	});

	it("refuses to save and writes nothing", async () => {
		await expect(
			service.save("user-1", {
				provider: "microsoft",
				clientId: "someone-elses-app",
				clientSecret: "someone-elses-secret",
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(writes).toBe(0);
	});

	it("refuses to remove and writes nothing", async () => {
		await expect(
			service.remove("user-1", { provider: "microsoft" }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(writes).toBe(0);
	});
});
