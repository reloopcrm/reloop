import { afterEach, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { accessGuard } from "../src/access-guard";
import { API_KEY_HEADER } from "../src/api-keys";
import { isFreshPasswordSession, PASSWORD_RULES } from "../src/password-rules";

const original = process.env.ALLOWED_SIGN_IN;
afterEach(() => {
	if (original === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = original;
});

function context(
	path: string,
	createdAt: Date,
	headers = new Headers(),
	body?: Record<string, string>,
) {
	return {
		path,
		headers,
		body,
		context: {
			session: { user: { email: "rep@example.com" }, session: { createdAt } },
		},
	} as Parameters<typeof accessGuard>[0];
}

it("checks password freshness at both time boundaries", () => {
	const now = Date.now();
	expect(isFreshPasswordSession(new Date(now), now)).toBe(true);
	expect(
		isFreshPasswordSession(new Date(now - PASSWORD_RULES.freshSessionMs), now),
	).toBe(true);
	expect(
		isFreshPasswordSession(
			new Date(now - PASSWORD_RULES.freshSessionMs - 1),
			now,
		),
	).toBe(false);
	expect(isFreshPasswordSession(new Date(now + 1), now)).toBe(false);
	expect(isFreshPasswordSession(new Date(Number.NaN), now)).toBe(false);
});

for (const path of ["/change-password", "/set-password"]) {
	it(`rejects API keys on ${path}`, async () => {
		await expect(
			accessGuard(
				context(path, new Date(), new Headers({ [API_KEY_HEADER]: "test" })),
			),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
	});
	it(`rejects stale sessions on ${path}`, async () => {
		process.env.ALLOWED_SIGN_IN = "example.com";
		await expect(accessGuard(context(path, new Date(0)))).rejects.toMatchObject(
			{ status: "FORBIDDEN" },
		);
	});
}

it("rejects existing auth sessions after allow-list removal", async () => {
	process.env.ALLOWED_SIGN_IN = "different.example";
	await expect(
		accessGuard(context("/get-session", new Date())),
	).rejects.toMatchObject({ status: "FORBIDDEN" });
});

it("refuses an SSO provider that names no workspace", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	for (const body of [
		undefined,
		{},
		{ organizationId: "other" },
		{ providerId: "okta", issuer: "https://okta.example" },
	]) {
		await expect(
			accessGuard(context("/sso/register", new Date(), new Headers(), body)),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	}
});

it("lets the CRM register an SSO provider for this workspace", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	await expect(
		accessGuard(
			context("/sso/register", new Date(), new Headers(), {
				organizationId: WORKSPACE_ID,
				providerId: "okta",
			}),
		),
	).resolves.toBeUndefined();
});

for (const path of [
	"/organization/update",
	"/organization/update-member-role",
	"/organization/create",
	"/organization/delete",
	"/organization/remove-member",
	"/organization/leave",
]) {
	it(`blocks ${path}`, async () => {
		process.env.ALLOWED_SIGN_IN = "example.com";
		await expect(accessGuard(context(path, new Date()))).rejects.toMatchObject({
			status: "FORBIDDEN",
		});
	});
}

it("leaves an organization read alone", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	await expect(
		accessGuard(context("/organization/list-members", new Date())),
	).resolves.toBeUndefined();
});

for (const path of ["/api-key/create", "/api-key/delete", "/api-key/list"]) {
	it(`refuses ${path} to a caller that carries an API key`, async () => {
		process.env.ALLOWED_SIGN_IN = "example.com";
		await expect(
			accessGuard(
				context(path, new Date(), new Headers({ [API_KEY_HEADER]: "test" })),
			),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
	});
}

it("lets a signed-in rep create an API key", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	await expect(
		accessGuard(context("/api-key/create", new Date())),
	).resolves.toBeUndefined();
});
