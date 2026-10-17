import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { API_KEY_HEADER, auth } from "@crm/auth";
import { db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { REST_RATE_LIMIT } from "../src/http/http-config";
import { restRateLimit } from "../src/http/rest-rate-limit.middleware";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const runId = process.env.TEST_RUN_ID ?? "spec";
const userId = `rest-rate-scope-${runId}`;
const domain = "example.com";
const email = `rest-rate-scope-${runId}@${domain}`;
const limit = { max: 5, windowMs: 60_000 };

describe("the REST rate limit behind the cloud middleware", () => {
	const scope = new AsyncLocalStorage<string>();
	const marker = "tenant-resolved";
	const seen: (string | undefined)[] = [];
	const enterScope: RequestHandler = (_req, _res, next) => {
		scope.run(marker, next);
	};
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let key = "";
	let storedKeys: string[] = [];
	let allowed: string | undefined;
	const spies: { mockRestore: () => void }[] = [];

	beforeAll(async () => {
		allowed = process.env.ALLOWED_SIGN_IN;
		process.env.ALLOWED_SIGN_IN = domain;

		const scopedKey = cloud.scopedKey;
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
			spyOn(cloud, "scopedKey").mockImplementation((value) => {
				seen.push(scope.getStore());
				return scopedKey(value);
			}),
		);

		await db.user.deleteMany({ where: { id: userId } });
		await db.user.create({
			data: {
				id: userId,
				email,
				name: "REST rate limit scope",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		key = (
			await auth.api.createApiKey({
				body: { name: "rate scope", userId, expiresIn: null },
			})
		).key;

		const rows = await db.apikey.findMany({
			where: { referenceId: userId },
			select: { id: true },
		});
		storedKeys = rows.map(
			(row) => `${REST_RATE_LIMIT.storeKeyPrefix}${row.id}`,
		);

		app = await createApp({
			restRateLimit: limit,
			cloudMiddleware: [enterScope],
		});
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		for (const spy of spies) spy.mockRestore();
		await db.user.deleteMany({ where: { id: userId } });
		await db.rateLimit.deleteMany({ where: { key: { in: storedKeys } } });

		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	for (const path of [
		"/api/rest/currency/settings",
		"/api/trpc/currency.settings",
	])
		it(`counts a key on ${path} only inside the scope the cloud middleware opened`, async () => {
			seen.length = 0;

			const response = await request(server).get(path).set(API_KEY_HEADER, key);

			expect(response.status).toBe(200);
			expect(seen.length).toBeGreaterThan(0);
			expect(seen.every((store) => store === marker)).toBe(true);
		});
});

describe("the REST rate limit prune", () => {
	let workspace = "a";
	let pruned = 0;
	const client = {
		apikey: { findFirst: async () => ({ id: "prune-spec" }) },
		$executeRaw: async () => {
			pruned += 1;
			return 0;
		},
		$queryRaw: async () => [{ count: 1, windowStart: BigInt(Date.now()) }],
	} as never;
	const spies: { mockRestore: () => void }[] = [];

	beforeAll(() => {
		spies.push(
			spyOn(cloud, "scopedKey").mockImplementation(
				(value) => `${workspace}:${value}`,
			),
		);
	});

	afterAll(() => {
		for (const spy of spies) spy.mockRestore();
	});

	it("prunes once per window in every workspace, not once per process", async () => {
		const app = express();
		app.use(
			restRateLimit({ max: 10, windowMs: 60_000 }, client),
			(_req, res) => {
				res.end("next");
			},
		);
		const call = async (scope: string) => {
			workspace = scope;
			return request(app).get("/").set(API_KEY_HEADER, "prune-key");
		};

		expect((await call("a")).status).toBe(200);
		expect(pruned).toBe(1);
		expect((await call("a")).status).toBe(200);
		expect(pruned).toBe(1);
		expect((await call("b")).status).toBe(200);
		expect(pruned).toBe(2);
		expect((await call("b")).status).toBe(200);
		expect((await call("a")).status).toBe(200);
		expect(pruned).toBe(2);
	});
});
