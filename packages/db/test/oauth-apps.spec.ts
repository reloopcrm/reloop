import { describe, expect, it } from "bun:test";

process.env.BETTER_AUTH_SECRET = "a-test-secret-for-sealing-oauth-apps";

const {
	OAUTH_APP_REDIRECT_PATHS,
	openOAuthAppSecret,
	sealOAuthAppSecret,
	storedOAuthApp,
} = await import("../src/oauth-apps");

const row = {
	googleClientId: "  google-id  ",
	googleClientSecret: sealOAuthAppSecret("google-secret"),
	microsoftClientId: "entra-id",
	microsoftClientSecret: sealOAuthAppSecret("entra-secret"),
	microsoftTenantId: "  ",
	slackClientId: "slack-id",
	slackClientSecret: null,
};

describe("sealOAuthAppSecret", () => {
	it("never stores the secret in the clear", () => {
		const sealed = sealOAuthAppSecret("google-secret");

		expect(sealed).not.toContain("google-secret");
		expect(openOAuthAppSecret(sealed)).toBe("google-secret");
	});

	it("reads a value that was saved before sealing existed", () => {
		expect(openOAuthAppSecret("plain-secret")).toBe("plain-secret");
	});
});

describe("storedOAuthApp", () => {
	it("opens the secret and trims the client id", () => {
		expect(storedOAuthApp(row, "google")).toEqual({
			clientId: "google-id",
			clientSecret: "google-secret",
			tenantId: null,
		});
	});

	it("reads an empty tenant as none, so the default applies", () => {
		expect(storedOAuthApp(row, "microsoft")?.tenantId).toBe(null);
	});

	it("is nothing when half the pair is missing", () => {
		expect(storedOAuthApp(row, "slack")).toBe(null);
		expect(storedOAuthApp(null, "google")).toBe(null);
	});
});

describe("OAUTH_APP_REDIRECT_PATHS", () => {
	it("keeps Slack on the generic OAuth callback", () => {
		expect(OAUTH_APP_REDIRECT_PATHS.slack).toBe(
			"/api/auth/oauth2/callback/slack",
		);
		expect(OAUTH_APP_REDIRECT_PATHS.google).toBe("/api/auth/callback/google");
	});
});
