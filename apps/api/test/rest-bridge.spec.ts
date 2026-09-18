import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER, auth } from "@crm/auth";
import { db } from "@crm/db";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const runId = process.env.TEST_RUN_ID ?? "spec";
const userId = `rest-bridge-${runId}`;
const domain = "example.com";
const email = `rest-bridge-${runId}@${domain}`;

describe("the REST bridge", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let key = "";
	let allowed: string | undefined;
	const spies: { mockRestore: () => void }[] = [];

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

		await db.user.deleteMany({ where: { id: userId } });
		await db.user.create({
			data: {
				id: userId,
				email,
				name: "REST bridge",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const created = await auth.api.createApiKey({
			body: { name: "rest bridge spec", userId, expiresIn: null },
		});
		key = created.key;

		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		await db.user.deleteMany({ where: { id: userId } });
		for (const spy of spies) spy.mockRestore();

		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	for (const mount of ["/rest", "/api/rest"]) {
		it(`routes ${mount} to the bridge and refuses a caller with no key and no session`, async () => {
			const response = await request(server).get(`${mount}/currency/settings`);

			expect(response.status).toBe(401);
		});
	}

	it("refuses the OpenAPI document to a caller with no key and no session", async () => {
		const response = await request(server).get("/api/openapi.json");

		expect(response.status).toBe(401);
	});

	it("serves the OpenAPI document to a key, pointed at the proxied mount", async () => {
		const response = await request(server)
			.get("/api/openapi.json")
			.set(API_KEY_HEADER, key);

		expect(response.status).toBe(200);
		expect(response.body.servers[0].url).toEndWith("/api/rest");
		expect(response.body.paths["/contacts/search"]).toBeDefined();
	});

	it("lets a key read a normal procedure through the proxied mount", async () => {
		const response = await request(server)
			.post("/api/rest/contacts/search")
			.set(API_KEY_HEADER, key)
			.send({ pageSize: 10 });

		expect(response.status).toBe(200);
		expect(Array.isArray(response.body.rows)).toBe(true);
		expect(response.body.rows.length).toBeLessThanOrEqual(10);
	});

	it("refuses a key on the API key procedures", async () => {
		const response = await request(server)
			.get("/api/rest/api-keys")
			.set(API_KEY_HEADER, key);

		expect(response.status).toBe(401);
	});
});
