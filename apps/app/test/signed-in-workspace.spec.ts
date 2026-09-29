import { afterAll, describe, expect, it, mock } from "bun:test";
import type { WorkspaceRole } from "@crm/auth/roles";
import { BRAND } from "@crm/ui/lib/brand";
import type { Subscription } from "../lib/signed-in-entry";

let session: { user: { id: string; email: string } } | null = null;
let role: WorkspaceRole | null = "owner";
let row: { name: string; slug: string } | null = null;
let scope: { slug: string } | null = null;
let subscribed: Subscription | null = null;

const sessionModule = { ...(await import("../lib/session")) };
const scopeModule = { ...(await import("../cloud/scope.server")) };

mock.module("../lib/session", () => ({
	...sessionModule,
	getSession: async () => session,
	workspaceRole: async () => role,
	workspaceRow: async () => row,
}));
mock.module("../cloud/scope.server", () => ({
	...scopeModule,
	requestScope: async () => scope,
	subscription: async () => subscribed,
}));

const { signedInWorkspace } = await import("../lib/signed-in");

afterAll(() => {
	mock.restore();
	mock.module("../lib/session", () => sessionModule);
	mock.module("../cloud/scope.server", () => scopeModule);
});

function signIn(next: {
	subscription?: Subscription | null;
	role?: WorkspaceRole | null;
	row?: { name: string; slug: string } | null;
}) {
	session = { user: { id: "user", email: "preview@example.com" } };
	scope = { slug: "preview" };
	subscribed = next.subscription ?? null;
	role = next.role === undefined ? "owner" : next.role;
	row = next.row === undefined ? { name: "Acme", slug: "acme" } : next.row;
}

describe("the signed-in workspace on the sign-up page", () => {
	it("is nothing without a session", async () => {
		session = null;
		scope = { slug: "preview" };
		expect(await signedInWorkspace()).toBeNull();
	});

	it("is nothing without a workspace scope", async () => {
		signIn({});
		scope = null;
		expect(await signedInWorkspace()).toBeNull();
	});

	it("has no subscription when the scope has none", async () => {
		signIn({});
		expect(await signedInWorkspace()).toEqual({
			email: "preview@example.com",
			name: "Acme",
			slug: "acme",
			admin: true,
			subscription: null,
		});
	});

	it("passes the subscription of the scope through", async () => {
		signIn({ subscription: { plan: "team", interval: "year" } });
		expect((await signedInWorkspace())?.subscription).toEqual({
			plan: "team",
			interval: "year",
		});
	});

	it("tells a member from an admin", async () => {
		signIn({ role: "member" });
		expect((await signedInWorkspace())?.admin).toBe(false);
		signIn({ role: "admin" });
		expect((await signedInWorkspace())?.admin).toBe(true);
	});

	it("falls back to the scope slug and the brand name without a workspace row", async () => {
		signIn({ row: null });
		expect(await signedInWorkspace()).toMatchObject({
			slug: "preview",
			name: BRAND.name,
		});
	});
});
