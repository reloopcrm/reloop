import { afterAll, describe, expect, it, mock } from "bun:test";
import type { WorkspaceRole } from "@crm/auth/roles";
import { NO_BILLING, type Tenant } from "@crm/db/tenancy";
import { BRAND } from "@crm/ui/lib/brand";

let session: { user: { id: string; email: string } } | null = null;
let role: WorkspaceRole | null = "owner";
let row: { name: string; slug: string } | null = null;
let tenant: Tenant | null = null;

const sessionModule = { ...(await import("../lib/session")) };
const tenantModule = { ...(await import("../lib/tenant")) };

mock.module("../lib/session", () => ({
	...sessionModule,
	getSession: async () => session,
	workspaceRole: async () => role,
	workspaceRow: async () => row,
}));
mock.module("../lib/tenant", () => ({
	...tenantModule,
	requestTenant: async () => tenant,
}));

const { signedInWorkspace } = await import("../lib/signed-in");

afterAll(() => {
	mock.restore();
	mock.module("../lib/session", () => sessionModule);
	mock.module("../lib/tenant", () => tenantModule);
});

function tenantWith(plan: string, billing: Partial<Tenant["billing"]>): Tenant {
	return {
		id: "preview",
		slug: "preview",
		dbName: "crm_preview",
		plan,
		status: "active",
		aiMode: "operator",
		signIn: "google",
		createdAt: new Date("2026-09-01T00:00:00.000Z"),
		trialEndsAt: null,
		suspendedAt: null,
		deletedAt: null,
		allowList: [],
		paidUntil: null,
		graceUntil: null,
		billing: { ...NO_BILLING, ...billing },
	};
}

function signIn(next: {
	plan: string;
	billing?: Partial<Tenant["billing"]>;
	role?: WorkspaceRole | null;
	row?: { name: string; slug: string } | null;
}) {
	session = { user: { id: "user", email: "preview@example.com" } };
	tenant = tenantWith(next.plan, next.billing ?? {});
	role = next.role === undefined ? "owner" : next.role;
	row = next.row === undefined ? { name: "Acme", slug: "acme" } : next.row;
}

describe("the signed-in workspace on the sign-up page", () => {
	it("is nothing without a session", async () => {
		session = null;
		tenant = tenantWith("trial", {});
		expect(await signedInWorkspace()).toBeNull();
	});

	it("has no subscription on a trial", async () => {
		signIn({ plan: "trial" });
		expect(await signedInWorkspace()).toEqual({
			email: "preview@example.com",
			name: "Acme",
			slug: "acme",
			admin: true,
			subscription: null,
		});
	});

	it("reads plan and interval of an active subscription", async () => {
		signIn({ plan: "start", billing: { status: "active", interval: "month" } });
		expect((await signedInWorkspace())?.subscription).toEqual({
			plan: "start",
			interval: "month",
		});
	});

	it("counts a failed payment as a subscription", async () => {
		signIn({ plan: "team", billing: { status: "past_due", interval: "year" } });
		expect((await signedInWorkspace())?.subscription).toEqual({
			plan: "team",
			interval: "year",
		});
	});

	it("maps a legacy plan id to the current one", async () => {
		signIn({ plan: "handel", billing: { status: "active", interval: "year" } });
		expect((await signedInWorkspace())?.subscription).toEqual({
			plan: "standard",
			interval: "year",
		});
	});

	it("counts a canceled subscription as none", async () => {
		signIn({ plan: "start", billing: { status: "canceled", interval: null } });
		expect((await signedInWorkspace())?.subscription).toBeNull();
	});

	it("tells a member from an admin", async () => {
		signIn({ plan: "trial", role: "member" });
		expect((await signedInWorkspace())?.admin).toBe(false);
		signIn({ plan: "trial", role: "admin" });
		expect((await signedInWorkspace())?.admin).toBe(true);
	});

	it("falls back to the tenant slug and the brand name without a workspace row", async () => {
		signIn({ plan: "trial", row: null });
		expect(await signedInWorkspace()).toMatchObject({
			slug: "preview",
			name: BRAND.name,
		});
	});
});
