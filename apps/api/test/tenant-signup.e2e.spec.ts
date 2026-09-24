import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { setPasswordFor, TENANT_COOKIE_NAME } from "@crm/auth";
import { db } from "@crm/db";
import { dbNameOf, dropDatabase } from "@crm/db/provision";
import {
	closeRegistry,
	forgetTenants,
	removeTenant,
	type Tenant,
	tenantById,
	tenantDatabaseUrl,
} from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import {
	prepareTestTenants,
	registryQuery,
	TEST_TENANTS,
} from "@crm/db/test-tenants";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";
import { TenantSweepService } from "../src/tenancy/tenant-sweep.service";

const runId = (process.env.TEST_RUN_ID ?? "spec")
	.toLowerCase()
	.replace(/[^a-z0-9]/g, "");
const password = "ein-sehr-langes-passwort-fuer-signup";

const company = `Newco ${runId}`;
const newId = `newco-${runId}`;
const owner = `owner@newco-${runId}.example`;
const stale = { company: `Stale ${runId}`, email: `stale-${runId}@gmail.com` };
const staleId = `stale-${runId}`;

const cookieOf = (response: request.Response): string =>
	String(response.headers["set-cookie"] ?? "")
		.split(",")
		.map((part) => part.split(";")[0]?.trim() ?? "")
		.find((part) => part.startsWith(`${TENANT_COOKIE_NAME}=`)) ?? "";

describe("tenant signup, lookup and activation", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	const spies: { mockRestore: () => void }[] = [];
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;

	const wipe = async (id: string) => {
		await removeTenant(id).catch(() => undefined);
		await dropDatabase(tenantDatabaseUrl(dbNameOf(id))).catch(() => undefined);
	};

	beforeAll(async () => {
		await prepareTestTenants();
		await wipe(newId);
		await wipe(staleId);

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
		);

		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		try {
			await app?.close();
			await wipe(newId);
			await wipe(staleId);
			await closeRegistry();
		} finally {
			for (const spy of spies) spy.mockRestore();
			if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = saved.registry;
			if (saved.template === undefined)
				delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
			else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
		}
	});

	it("answers 404 NO_WORKSPACE for an unknown address", async () => {
		const response = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: `nobody-${runId}@nowhere.example` });

		expect(response.status).toBe(404);
		expect(response.body).toMatchObject({ code: "NO_WORKSPACE" });
		expect(cookieOf(response)).toBe("");
	});

	it("answers 422 for a malformed body", async () => {
		await request(server)
			.post("/api/tenant/lookup")
			.send({ email: "not-an-address" })
			.expect(422);
		await request(server)
			.post("/api/tenant/signup")
			.send({ email: owner, name: "", company, plan: "trial", locale: "en" })
			.expect(422);
	});

	it("finds a workspace by domain and sets the tenant cookie", async () => {
		const response = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: `Rep@${TEST_TENANTS.a.domain}` });

		expect(response.status).toBe(200);
		expect(response.body.tenantId).toBe(TEST_TENANTS.a.id);
		expect(response.body.status).toBe("active");
		expect(response.body.signIn).not.toContain("email");
		expect(cookieOf(response)).toStartWith(
			`${TENANT_COOKIE_NAME}=${TEST_TENANTS.a.id}.`,
		);
	});

	it("registers a pending workspace, once", async () => {
		const response = await request(server)
			.post("/api/tenant/signup")
			.send({
				email: owner,
				name: "Owner",
				company,
				plan: "start",
				locale: "de",
				purchase: { plan: "office", interval: "month" },
			});

		expect(response.status).toBe(201);
		expect(response.body).toEqual({ tenantId: newId, next: "oauth" });
		expect(cookieOf(response)).toStartWith(`${TENANT_COOKIE_NAME}=${newId}.`);

		const tenant = await tenantById(newId);
		expect(tenant?.status).toBe("pending");
		expect(tenant?.plan).toBe("trial");
		expect(tenant?.billing.wanted).toEqual({
			plan: "office",
			interval: "month",
		});
		expect(tenant?.allowList).toEqual([owner]);
		expect(tenant?.dbName).toBe(dbNameOf(newId));

		const twice = await request(server).post("/api/tenant/signup").send({
			email: owner,
			name: "Owner",
			company,
			plan: "start",
			locale: "de",
		});
		expect(twice.status).toBe(409);
		expect(twice.body).toMatchObject({ code: "WORKSPACE_EXISTS" });

		const lookup = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: owner })
			.expect(200);
		expect(lookup.body.status).toBe("pending");
	}, 120_000);

	it("activates on the first sign-in with that address and registers the domain", async () => {
		const tenant = (await tenantById(newId)) as Tenant;
		const userId = `signup-${runId}`;
		await runAsTenant(tenant, async () => {
			await db.user.create({
				data: {
					id: userId,
					email: owner,
					name: "Owner",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await setPasswordFor(userId, password);
		});

		const lookup = await request(server)
			.post("/api/tenant/lookup")
			.send({ email: owner });
		await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", cookieOf(lookup))
			.send({ email: owner, password })
			.expect(200);

		forgetTenants();
		const activated = await tenantById(newId);
		expect(activated?.status).toBe("active");
		expect(activated?.allowList).toEqual([`newco-${runId}.example`, owner]);
	}, 60_000);

	it("rate limits repeated lookups from one address", async () => {
		const email = `burst-${runId}@nowhere.example`;
		let last = 0;
		for (let index = 0; index < 6; index += 1) {
			last = (await request(server).post("/api/tenant/lookup").send({ email }))
				.status;
		}
		expect(last).toBe(429);
	});

	it("removes a pending workspace older than 48 hours in the sweep", async () => {
		await request(server)
			.post("/api/tenant/signup")
			.send({
				email: stale.email,
				name: "Stale",
				company: stale.company,
				plan: "trial",
				locale: "en",
			})
			.expect(201);
		expect((await tenantById(staleId))?.allowList).toEqual([stale.email]);

		await registryQuery(
			"UPDATE tenant SET created_at = now() - interval '3 days' WHERE id = $1",
			[staleId],
		);

		const report = await app?.get(TenantSweepService).sweep(new Date());
		expect(report?.removedPending).toBe(1);
		expect(await tenantById(staleId)).toBeNull();
		expect((await tenantById(newId))?.status).toBe("active");
		expect(report?.suspended).toBe(0);
	}, 120_000);
});
