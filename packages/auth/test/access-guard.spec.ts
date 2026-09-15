import { afterEach, expect, it } from "bun:test";
import { accessGuard } from "../src/access-guard";
import { API_KEY_HEADER } from "../src/api-keys";
import { isFreshPasswordSession, PASSWORD_RULES } from "../src/password-rules";

const original = process.env.ALLOWED_SIGN_IN;
afterEach(() => {
	if (original === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = original;
});

function context(path: string, createdAt: Date, headers = new Headers()) {
	return {
		path,
		headers,
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
