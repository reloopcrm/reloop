import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER, auth } from "@crm/auth";
import { db } from "@crm/db";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { REST_RATE_LIMIT } from "../src/http/http-config";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const runId = process.env.TEST_RUN_ID ?? "spec";
const userId = `rest-rate-${runId}`;
const domain = "example.com";
const email = `rest-rate-${runId}@${domain}`;
const limit = { max: 3, windowMs: 60_000 };

describe("the REST rate limit", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let firstKey = "";
	let secondKey = "";
	let thirdKey = "";
	let storedKeys: string[] = [];
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
				name: "REST rate limit",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		firstKey = (
			await auth.api.createApiKey({
				body: { name: "rate one", userId, expiresIn: null },
			})
		).key;
		secondKey = (
			await auth.api.createApiKey({
				body: { name: "rate two", userId, expiresIn: null },
			})
		).key;

		thirdKey = (
			await auth.api.createApiKey({
				body: { name: "rate three", userId, expiresIn: null },
			})
		).key;

		const rows = await db.apikey.findMany({
			where: { referenceId: userId },
			select: { id: true },
		});
		storedKeys = rows.map(
			(row) => `${REST_RATE_LIMIT.storeKeyPrefix}${row.id}`,
		);

		app = await createApp({ restRateLimit: limit });
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		await db.user.deleteMany({ where: { id: userId } });
		await db.rateLimit.deleteMany({ where: { key: { in: storedKeys } } });
		for (const spy of spies) spy.mockRestore();

		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	const call = (key: string, mount = "/api/rest") =>
		request(server).get(`${mount}/currency/settings`).set(API_KEY_HEADER, key);

	it("passes a key under its limit", async () => {
		for (let i = 0; i < limit.max; i += 1) {
			expect((await call(firstKey)).status).toBe(200);
		}
	});

	it("answers 429 with Retry-After once a key passes its limit", async () => {
		const refused = await call(firstKey);

		expect(refused.status).toBe(429);
		const retry = Number(refused.headers["retry-after"]);
		expect(Number.isInteger(retry)).toBe(true);
		expect(retry).toBeGreaterThanOrEqual(1);
		expect(retry).toBeLessThanOrEqual(limit.windowMs / 1_000);
		expect((await call(firstKey, "/rest")).status).toBe(429);
		expect(refused.body.message).toBe(
			"Too many requests. Wait before you send the next request.",
		);
	});

	it("counts a second key on its own", async () => {
		expect((await call(secondKey)).status).toBe(200);
	});

	it("does not limit a request without an API key", async () => {
		for (let i = 0; i < limit.max + 2; i += 1) {
			const response = await request(server).get("/api/rest/currency/settings");

			expect(response.status).toBe(401);
		}
	});

	it("stores nothing for a key that does not exist and refuses it", async () => {
		const before = await db.rateLimit.count({
			where: { key: { startsWith: REST_RATE_LIMIT.storeKeyPrefix } },
		});

		for (let i = 0; i < limit.max + 2; i += 1) {
			expect((await call(`not-a-key-${runId}-${i}`)).status).toBe(401);
		}

		const after = await db.rateLimit.count({
			where: { key: { startsWith: REST_RATE_LIMIT.storeKeyPrefix } },
		});

		expect(after).toBeLessThanOrEqual(before);
	});

	it("counts a key on /api/trpc against the same counter as the REST bridge", async () => {
		const trpc = () =>
			request(server)
				.get("/api/trpc/currency.settings")
				.set(API_KEY_HEADER, thirdKey);

		expect((await call(thirdKey)).status).toBe(200);
		expect((await call(thirdKey)).status).toBe(200);
		expect((await trpc()).status).toBe(200);

		const refused = await trpc();

		expect(refused.status).toBe(429);
		expect(Number(refused.headers["retry-after"])).toBeGreaterThanOrEqual(1);
		expect((await call(thirdKey)).status).toBe(429);
	});

	it("does not limit a session style request on /api/trpc", async () => {
		for (let i = 0; i < limit.max + 2; i += 1) {
			const response = await request(server).get("/api/trpc/currency.settings");

			expect(response.status).not.toBe(429);
		}
	});

	it("closes the server after an early 429 on a POST with a JSON body", async () => {
		const refused = await request(server)
			.post("/api/rest/contacts/search")
			.set(API_KEY_HEADER, firstKey)
			.send({ pageSize: 1, search: "x".repeat(20_000) });

		expect(refused.status).toBe(429);

		const closing = app?.close();
		app = undefined;
		const closed = await Promise.race([
			closing?.then(() => true),
			new Promise<boolean>((resolve) =>
				setTimeout(() => resolve(false), 3_000),
			),
		]);

		expect(closed).toBe(true);
	});
});
