import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import {
	auth,
	cookieValue,
	setPasswordFor,
	TENANT_COOKIE_NAME,
	tenantCookieValue,
	WORKSPACE_ID,
} from "@crm/auth";
import { db } from "@crm/db";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants, TEST_TENANTS } from "@crm/db/test-tenants";

const runId = process.env.TEST_RUN_ID ?? "spec";
const userId = `tenant-loaders-${runId}`;
const password = "ein-sehr-langes-passwort-fuer-tenant-loaders";
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const PREPARE_TIMEOUT_MS = 120_000;

const emailOf = (tenant: { domain: string }) => `${userId}@${tenant.domain}`;

let cookie = "";
const nextHeaders = { ...(await import("next/headers")) };
const nextServer = { ...(await import("next/server")) };

mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
	...nextHeaders,
	cookies: async () => ({
		get: (name: string) => {
			const value = cookieValue(cookie, name);
			return value === undefined ? undefined : { name, value };
		},
		toString: () => cookie,
	}),
	headers: async () => new Headers(cookie ? { cookie } : {}),
}));
mock.module("next/server", () => ({
	...nextServer,
	connection: async () => undefined,
}));

const { getSession, signInAccounts, workspaceRole } = await import(
	"../lib/session"
);
const { hasRecordsToShow } = await import("../lib/mailbox-connection");

const tenantCookie = (tenant: Tenant) =>
	`${TENANT_COOKIE_NAME}=${tenantCookieValue(tenant.id, secret)}`;

describe("app loaders read the tenant named by the cookie", () => {
	const saved = {
		registry: process.env.RELOOP_REGISTRY_URL,
		template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
		demo: process.env.RELOOP_DEMO,
	};
	let fetchSpy: { mockRestore: () => void } | undefined;
	let a: Tenant;
	let b: Tenant;
	let sessionOfA = "";

	const clean = (tenant: Tenant) =>
		runAsTenant(tenant, async () => {
			await db.mailboxSync.deleteMany({ where: { userId } });
			await db.session.deleteMany({ where: { userId } });
			await db.account.deleteMany({ where: { userId } });
			await db.member.deleteMany({ where: { userId } });
			await db.user.deleteMany({ where: { id: userId } });
		});

	const seed = (tenant: Tenant, email: string, role: "owner" | "member") =>
		runAsTenant(tenant, async () => {
			await db.user.create({
				data: {
					id: userId,
					email,
					name: "Tenant loaders spec",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await db.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: "Spec",
					slug: `spec-${tenant.id}`,
					createdAt: new Date(),
				},
				update: {},
			});
			await db.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId: WORKSPACE_ID,
					userId,
					role,
					createdAt: new Date(),
				},
			});
		});

	beforeAll(async () => {
		delete process.env.RELOOP_DEMO;
		({ a, b } = await prepareTestTenants());

		await clean(a);
		await clean(b);
		await seed(a, emailOf(TEST_TENANTS.a), "owner");
		await seed(b, emailOf(TEST_TENANTS.b), "member");

		await runAsTenant(a, async () => {
			await db.account.create({
				data: {
					id: crypto.randomUUID(),
					accountId: `google-${userId}`,
					providerId: "google",
					userId,
					scope: "openid email profile",
				},
			});
			await db.mailboxSync.create({ data: { userId, source: "google" } });
			await setPasswordFor(userId, password);
			const { headers } = await auth.api.signInEmail({
				body: { email: emailOf(TEST_TENANTS.a), password },
				returnHeaders: true,
			});
			sessionOfA = headers
				.getSetCookie()
				.map((part) => part.split(";")[0]?.trim() ?? "")
				.join("; ");
		});
		expect(sessionOfA).toContain("session_token");

		fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("no API in this spec"),
		);
	}, PREPARE_TIMEOUT_MS);

	afterAll(async () => {
		fetchSpy?.mockRestore();
		cookie = "";
		mock.module("next/headers", () => nextHeaders);
		mock.module("next/server", () => nextServer);
		try {
			await clean(a);
			await clean(b);
			await closeRegistry();
		} finally {
			if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
			else process.env.RELOOP_REGISTRY_URL = saved.registry;
			if (saved.template === undefined)
				delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
			else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
			if (saved.demo !== undefined) process.env.RELOOP_DEMO = saved.demo;
		}
	});

	it("serves tenant A's data with tenant A's cookie", async () => {
		cookie = `${tenantCookie(a)}; ${sessionOfA}`;

		const session = await getSession();
		expect(session?.user.email).toBe(emailOf(TEST_TENANTS.a));
		expect(await workspaceRole(userId)).toBe("owner");
		expect(await signInAccounts(userId)).toEqual([
			{ providerId: "google", scope: "openid email profile" },
			{ providerId: "credential", scope: null },
		]);
		expect(await hasRecordsToShow()).toBe(true);
	});

	it("serves tenant B's data with tenant B's cookie, and refuses A's session", async () => {
		cookie = `${tenantCookie(b)}; ${sessionOfA}`;

		expect(await getSession()).toBeNull();
		expect(await workspaceRole(userId)).toBe("member");
		expect(await signInAccounts(userId)).toEqual([]);
		expect(await hasRecordsToShow()).toBe(false);
	});

	it("answers empty, and throws nothing, without a tenant cookie", async () => {
		cookie = sessionOfA;

		expect(await getSession()).toBeNull();
		expect(await workspaceRole(userId)).toBeNull();
		expect(await signInAccounts(userId)).toEqual([]);
		expect(await hasRecordsToShow()).toBe(false);
	});
});
