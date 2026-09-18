import { describe, expect, it } from "bun:test";
import type { WorkspaceRole } from "@crm/auth";
import type { Db, WebhookModel } from "@crm/db";
import { sealWebhookSecret } from "@crm/db/webhooks";
import type { AgentAccessService } from "../src/agent/agent-access.service";
import { WebhooksService } from "../src/webhooks/webhooks.service";

const ADDRESS = "https://hooks.example.test/t/9f3c1a";

const stored = {
	id: "wh-1",
	url: ADDRESS,
	events: ["deal.won"],
	enabled: true,
	allowPrivateHost: false,
	secret: sealWebhookSecret("a-secret-long-enough"),
	lastDeliveryAt: null,
	lastStatus: null,
	lastError: null,
	createdAt: new Date(),
} as unknown as WebhookModel;

function service(role: WorkspaceRole) {
	const db = {
		webhook: { findMany: async () => [stored] },
	} as unknown as Db;

	const access = {
		assertMember: async () => role,
	} as unknown as AgentAccessService;

	return new WebhooksService(db, access);
}

describe("who may read a webhook address", () => {
	it("gives an admin the address and the secret hint", async () => {
		const status = await service("admin").status("u1");

		expect(status.canManage).toBe(true);
		expect(status.webhooks[0]?.url).toBe(ADDRESS);
		expect(status.webhooks[0]?.secretHint).toBeTruthy();
	});

	it("gives a member neither the address nor the secret hint", async () => {
		const status = await service("member").status("u1");

		expect(status.canManage).toBe(false);
		expect(status.webhooks[0]?.url).toBeNull();
		expect(status.webhooks[0]?.secretHint).toBeNull();
		expect(JSON.stringify(status)).not.toContain(ADDRESS);
	});

	it("still shows a member that the webhook exists and is live", async () => {
		const status = await service("member").status("u1");

		expect(status.webhooks).toHaveLength(1);
		expect(status.webhooks[0]?.enabled).toBe(true);
	});
});
