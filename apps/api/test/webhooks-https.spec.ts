import { describe, expect, it } from "bun:test";
import type { WorkspaceRole } from "@crm/auth";
import type { Db, WebhookModel } from "@crm/db";
import { sealWebhookSecret } from "@crm/db/webhooks";
import type { AgentAccessService } from "../src/agent/agent-access.service";
import {
	createWebhookInput,
	updateWebhookInput,
} from "../src/webhooks/webhooks.contracts";
import { WebhooksService } from "../src/webhooks/webhooks.service";

const SECRET = "a-secret-long-enough-0123456789";
const EVENTS = ["deal.closed"] as const;

function created(url: string, allowPrivateHost: boolean) {
	return createWebhookInput.safeParse({
		url,
		events: [...EVENTS],
		secret: SECRET,
		allowPrivateHost,
	});
}

function messages(result: {
	success: boolean;
	error?: { issues: { message: string }[] };
}) {
	return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("the address of a new webhook", () => {
	it("refuses plain http on a public host", () => {
		const result = created("http://hooks.example.test/in", false);

		expect(result.success).toBe(false);
		expect(messages(result).join(" ")).toContain("https");
	});

	it("accepts https", () => {
		expect(created("https://hooks.example.test/in", false).success).toBe(true);
	});

	it("accepts plain http when the private address switch is on", () => {
		expect(created("http://10.0.0.5:8080/in", true).success).toBe(true);
	});

	it("keeps refusing a user name in the address", () => {
		expect(
			created("https://user:pass@hooks.example.test/in", false).success,
		).toBe(false);
	});
});

describe("the address of a changed webhook", () => {
	it("refuses plain http when the same change turns the switch off", () => {
		const result = updateWebhookInput.safeParse({
			id: "wh-1",
			url: "http://hooks.example.test/in",
			allowPrivateHost: false,
		});

		expect(result.success).toBe(false);
	});

	it("accepts https", () => {
		expect(
			updateWebhookInput.safeParse({
				id: "wh-1",
				url: "https://hooks.example.test/in",
			}).success,
		).toBe(true);
	});
});

function stored(overrides: Partial<WebhookModel>): WebhookModel {
	return {
		id: "wh-1",
		url: "https://hooks.example.test/in",
		events: ["deal.closed"],
		enabled: true,
		allowPrivateHost: false,
		secret: sealWebhookSecret(SECRET),
		lastDeliveryAt: null,
		lastStatus: null,
		lastError: null,
		createdAt: new Date(),
		...overrides,
	} as unknown as WebhookModel;
}

function service(row: WebhookModel, role: WorkspaceRole = "admin") {
	const written: { where: { id: string } }[] = [];
	const db = {
		webhook: {
			findMany: async () => [row],
			findUnique: async () => row,
			updateMany: async (args: { where: { id: string } }) => {
				written.push(args);
				return { count: 1 };
			},
		},
	} as unknown as Db;
	const access = {
		assertMember: async () => role,
	} as unknown as AgentAccessService;

	return { written, instance: new WebhooksService(db, access) };
}

describe("changing a webhook in the service", () => {
	it("refuses plain http on a webhook that does not allow a private host", async () => {
		const { written, instance } = service(stored({ allowPrivateHost: false }));

		await expect(
			instance.update("u1", {
				id: "wh-1",
				url: "http://hooks.example.test/in",
			}),
		).rejects.toThrow("https");
		expect(written).toHaveLength(0);
	});

	it("accepts plain http on a webhook that allows a private host", async () => {
		const { written, instance } = service(stored({ allowPrivateHost: true }));

		await instance.update("u1", { id: "wh-1", url: "http://10.0.0.5/in" });

		expect(written).toHaveLength(1);
	});

	it("leaves an existing http webhook alone when only the events change", async () => {
		const { written, instance } = service(
			stored({ url: "http://hooks.example.test/in" }),
		);

		await instance.update("u1", { id: "wh-1", events: ["deal.closed"] });

		expect(written).toHaveLength(1);
	});
});

describe("the secret hint of a webhook", () => {
	it("shows dots only and no character of the secret", async () => {
		const { instance } = service(stored({}));
		const status = await instance.status("u1");
		const hint = status.webhooks[0]?.secretHint ?? "";

		expect(hint).toMatch(/^•+$/);
		expect(hint).not.toContain(SECRET.slice(-4));
		expect(hint.length).toBeGreaterThanOrEqual(8);
	});
});
