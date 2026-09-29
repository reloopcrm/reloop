import { afterAll, describe, expect, it, mock } from "bun:test";

let session: { user: { id: string; email: string } } | null = null;
let row: { name: string; slug: string | null } | null = null;

const sessionModule = { ...(await import("../lib/session")) };

mock.module("../lib/session", () => ({
	...sessionModule,
	getSession: async () => session,
	workspaceRow: async () => row,
}));

const { landingTarget } = await import("../lib/landing-target");

afterAll(() => {
	mock.restore();
	mock.module("../lib/session", () => sessionModule);
});

const signedIn = { user: { id: "user", email: "preview@example.com" } };

describe("the open source landing page", () => {
	it("sends a visitor without a session to sign in", async () => {
		session = null;
		row = { name: "Acme", slug: "acme" };
		expect(await landingTarget()).toBe("/sign-in");
	});

	it("sends a signed-in rep to the workspace without asking the API", async () => {
		session = signedIn;
		row = { name: "Acme", slug: "acme" };
		expect(await landingTarget()).toBe("/acme");
	});

	it("stays on the page when the workspace has no slug, so sign-in cannot bounce it back", async () => {
		session = signedIn;
		for (const next of [null, { name: "Acme", slug: null }]) {
			row = next;
			expect(await landingTarget()).toBeNull();
		}
	});
});
