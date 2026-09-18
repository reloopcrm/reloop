import { afterEach, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { accessGuard } from "../src/access-guard";
import { API_KEY_HEADER, API_KEY_PREFIX } from "../src/api-keys";
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
			session: {
				user: { email: "rep@example.com" },
				session: { createdAt, token: "browser-session-token" },
			},
		},
	} as Parameters<typeof accessGuard>[0];
}

const cookieSession = (createdAt: Date) => ({
	createdAt,
	token: "browser-session-token",
});

it("checks password freshness at both time boundaries", () => {
	const now = Date.now();
	expect(isFreshPasswordSession(cookieSession(new Date(now)), now)).toBe(true);
	expect(
		isFreshPasswordSession(
			cookieSession(new Date(now - PASSWORD_RULES.freshSessionMs)),
			now,
		),
	).toBe(true);
	expect(
		isFreshPasswordSession(
			cookieSession(new Date(now - PASSWORD_RULES.freshSessionMs - 1)),
			now,
		),
	).toBe(false);
	expect(isFreshPasswordSession(cookieSession(new Date(now + 1)), now)).toBe(
		false,
	);
	expect(isFreshPasswordSession(cookieSession(new Date(Number.NaN)), now)).toBe(
		false,
	);
});

it("refuses a session minted from an API key, however new it is", () => {
	const now = Date.now();

	expect(
		isFreshPasswordSession(
			{ createdAt: new Date(now), token: `${API_KEY_PREFIX}live-key` },
			now,
		),
	).toBe(false);
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

it("refuses a key that chooses its own prefix", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	await expect(
		accessGuard(
			context("/api-key/create", new Date(), new Headers(), {
				name: "ci",
				prefix: "plain_",
			}),
		),
	).rejects.toMatchObject({ status: "FORBIDDEN" });
});

it("refuses an API key at the raw SSO register endpoint", async () => {
	process.env.ALLOWED_SIGN_IN = "example.com";
	await expect(
		accessGuard(
			context(
				"/sso/register",
				new Date(),
				new Headers({ [API_KEY_HEADER]: "test" }),
				{ organizationId: WORKSPACE_ID, providerId: "okta" },
			),
		),
	).rejects.toMatchObject({ status: "UNAUTHORIZED" });
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
