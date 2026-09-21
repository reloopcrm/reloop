import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import {
	API_KEY_HEADER,
	auth,
	setPasswordFor,
	TENANT_COOKIE_NAME,
	tenantCookieValue,
} from "@crm/auth";
import { db } from "@crm/db";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants, TEST_TENANTS } from "@crm/db/test-tenants";
import request from "supertest";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { createApp } from "../src/create-app";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";

const runId = process.env.TEST_RUN_ID ?? "spec";
const password = "ein-sehr-langes-passwort-fuer-tenants";

const userOf = (tenant: { id: string; domain: string }) => ({
	id: `tenancy-${tenant.id}-${runId}`,
	email: `tenancy-${runId}@${tenant.domain}`,
});

describe("hosted mode resolves the tenant on every request", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
	};
	const secret = process.env.BETTER_AUTH_SECRET ?? "";
	const spies: { mockRestore: () => void }[] = [];
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let a: Tenant;
	let b: Tenant;
	let keyOfA = "";
	let sessionOfB = "";

	const tenantCookie = (tenant: Tenant) =>
		`${TENANT_COOKIE_NAME}=${tenantCookieValue(tenant.id, secret)}`;

	const clean = (tenant: Tenant, userId: string) =>
		runAsTenant(tenant, async () => {
			await db.session.deleteMany({ where: { userId } });
			await db.apikey.deleteMany({ where: { referenceId: userId } });
			await db.account.deleteMany({ where: { userId } });
			await db.member.deleteMany({ where: { userId } });
			await db.user.deleteMany({ where: { id: userId } });
		});

	const createUser = (tenant: Tenant, user: { id: string; email: string }) =>
		runAsTenant(tenant, () =>
			db.user.create({
				data: {
					id: user.id,
					email: user.email,
					name: "Tenancy spec",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		);

	beforeAll(async () => {
		({ a, b } = await prepareTestTenants());

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

		await clean(a, userOf(TEST_TENANTS.a).id);
		await clean(b, userOf(TEST_TENANTS.b).id);
		await createUser(a, userOf(TEST_TENANTS.a));
		await createUser(b, userOf(TEST_TENANTS.b));

		keyOfA = await runAsTenant(a, async () => {
			const created = await auth.api.createApiKey({
				body: {
					name: "tenancy spec",
					userId: userOf(TEST_TENANTS.a).id,
					expiresIn: null,
				},
			});
			return created.key;
		});

		await runAsTenant(b, () =>
			setPasswordFor(userOf(TEST_TENANTS.b).id, password),
		);

		app = await createApp();
		server = app.getHttpServer();

		const signIn = await request(server)
			.post("/api/auth/sign-in/email")
			.set("cookie", tenantCookie(b))
			.send({ email: userOf(TEST_TENANTS.b).email, password })
			.expect(200);
		sessionOfB = String(signIn.headers["set-cookie"])
			.split(",")
			.map((part) => part.split(";")[0]?.trim() ?? "")
			.filter((part) => part.includes("session_token"))
			.join("; ");
		expect(sessionOfB).toContain("session_token");
	});

	afterAll(async () => {
		try {
			await app?.close();
			await clean(a, userOf(TEST_TENANTS.a).id);
			await clean(b, userOf(TEST_TENANTS.b).id);
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

	it("answers 401 TENANT_REQUIRED on tRPC without a tenant", async () => {
		const response = await request(server).get("/api/trpc/sso.signInOptions");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ message: "TENANT_REQUIRED" });
	});

	it("answers 401 TENANT_REQUIRED on better-auth without a tenant", async () => {
		const response = await request(server).get("/api/auth/get-session");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ message: "TENANT_REQUIRED" });
	});

	it("refuses a forged tenant cookie", async () => {
		const response = await request(server)
			.get("/api/trpc/sso.signInOptions")
			.set("cookie", `${TENANT_COOKIE_NAME}=${a.id}.forged`);

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ message: "TENANT_REQUIRED" });
	});

	it("serves /health without a tenant", async () => {
		await request(server).get("/health").expect(200);
	});

	it("lets a session in with its own tenant's cookie", async () => {
		const response = await request(server)
			.get("/auth/me")
			.set("cookie", `${tenantCookie(b)}; ${sessionOfB}`);

		expect(response.status).toBe(200);
		expect(response.body.user.email).toBe(userOf(TEST_TENANTS.b).email);
	});

	it("refuses tenant A's cookie with a session from tenant B", async () => {
		const response = await request(server)
			.get("/auth/me")
			.set("cookie", `${tenantCookie(a)}; ${sessionOfB}`);

		expect(response.status).toBe(401);
	});

	it("routes an API key by its tenant prefix, cookie or not", async () => {
		expect(keyOfA.startsWith(`crm_${a.id}_`)).toBe(true);

		const bare = await request(server)
			.get("/auth/me")
			.set(API_KEY_HEADER, keyOfA);
		expect(bare.status).toBe(200);
		expect(bare.body.user.email).toBe(userOf(TEST_TENANTS.a).email);

		const withOtherCookie = await request(server)
			.get("/auth/me")
			.set("cookie", tenantCookie(b))
			.set(API_KEY_HEADER, keyOfA);
		expect(withOtherCookie.status).toBe(200);
		expect(withOtherCookie.body.user.email).toBe(userOf(TEST_TENANTS.a).email);
	});

	it("finds nothing for a key whose prefix names another tenant", async () => {
		const forged = keyOfA.replace(`crm_${a.id}_`, `crm_${b.id}_`);

		const genuine = await request(server)
			.get("/api/trpc/currency.settings")
			.set(API_KEY_HEADER, keyOfA);
		expect(genuine.status).toBe(200);

		const response = await request(server)
			.get("/api/trpc/currency.settings")
			.set(API_KEY_HEADER, forged);
		expect(response.status).toBe(401);
	});

	it("resolves the tracking config route by site id", async () => {
		const known = await request(server).get(`/api/t/config/site-${a.id}`);
		expect(known.status).toBe(200);
		expect(known.body).toEqual({ config: null });

		const unknown = await request(server).get("/api/t/config/site-nobody");
		expect(unknown.status).toBe(401);
	});

	it("swallows a collector batch for an unknown site and stays 204", async () => {
		await request(server)
			.post("/api/t/e")
			.send({ siteId: "site-nobody", visitorId: "v", events: [] })
			.expect(204);
	});
});
