import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER, auth, setPasswordFor, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { sealWebhookSecret } from "@crm/db/webhooks";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `webhooks-session-only-${suffix}`;
const domain = "example.com";
const email = `${userId}@${domain}`;
const password = "ein-sehr-langes-passwort-fuer-webhooks";
const url = `https://hooks.example.com/webhooks-session-only-${suffix}`;

describe("removing a webhook needs a session", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let key = "";
	let cookie = "";
	let allowed: string | undefined;
	const spies: { mockRestore: () => void }[] = [];

	async function aWebhook() {
		return db.webhook.create({
			data: {
				url,
				secret: sealWebhookSecret("webhooks-session-only-secret"),
				events: ["contact.created"],
				enabled: true,
			},
			select: { id: true },
		});
	}

	beforeAll(async () => {
		allowed = process.env.ALLOWED_SIGN_IN;
		process.env.ALLOWED_SIGN_IN = domain;

		spies.push(
			spyOn(
				DispatchHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(
				MailboxSyncHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
				() => {},
			),
			spyOn(db, "$disconnect").mockResolvedValue(undefined),
		);

		await db.organization.upsert({
			where: { id: WORKSPACE_ID },
			update: {},
			create: {
				id: WORKSPACE_ID,
				name: "CRM",
				slug: "crm",
				createdAt: new Date(),
			},
		});
		await db.user.create({
			data: {
				id: userId,
				email,
				name: "Webhooks Session Only",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await db.member.create({
			data: {
				id: `member-${userId}`,
				organizationId: WORKSPACE_ID,
				userId,
				role: "owner",
				createdAt: new Date(),
			},
		});
		await setPasswordFor(userId, password);

		key = (
			await auth.api.createApiKey({
				body: { name: "webhooks session only spec", userId, expiresIn: null },
			})
		).key;

		const { headers } = await auth.api.signInEmail({
			body: { email, password },
			returnHeaders: true,
		});
		cookie = headers.getSetCookie().join("; ");

		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		await db.webhook.deleteMany({ where: { url } });
		await db.apikey.deleteMany({ where: { referenceId: userId } });
		await db.session.deleteMany({ where: { userId } });
		await db.account.deleteMany({ where: { userId } });
		await db.member.deleteMany({ where: { userId } });
		await db.user.deleteMany({ where: { id: userId } });
		for (const spy of spies) spy.mockRestore();

		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	it("refuses an API key on the REST delete route and keeps the webhook", async () => {
		const webhook = await aWebhook();

		const response = await request(server)
			.delete(`/api/rest/webhooks/${webhook.id}`)
			.set(API_KEY_HEADER, key);

		expect(response.status).toBe(401);
		expect(
			await db.webhook.findUnique({ where: { id: webhook.id } }),
		).not.toBeNull();
	});

	it("refuses an API key on webhooks.remove", async () => {
		const webhook = await aWebhook();

		const response = await request(server)
			.post("/api/trpc/webhooks.remove")
			.set(API_KEY_HEADER, key)
			.send({ id: webhook.id });

		expect(response.status).toBe(401);
		expect(
			await db.webhook.findUnique({ where: { id: webhook.id } }),
		).not.toBeNull();
	});

	it("lets a session remove the webhook", async () => {
		const webhook = await aWebhook();

		const response = await request(server)
			.delete(`/api/rest/webhooks/${webhook.id}`)
			.set("Cookie", cookie);

		expect(response.status).toBe(200);
		expect(
			await db.webhook.findUnique({ where: { id: webhook.id } }),
		).toBeNull();
	});
});
