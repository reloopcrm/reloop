import {
	appSecretKey,
	isSealedSecret,
	openSecret,
	sealSecret,
} from "./secrets";

const SECOND_MS = 1_000;

export const OAUTH_APPS = {
	purpose: "oauth-app-secret",
	providers: ["google", "microsoft", "slack"],
	clientId: { minLength: 1, maxLength: 300 },
	clientSecret: { minLength: 1, maxLength: 500 },
	tenantId: { minLength: 1, maxLength: 100, fallback: "common" },
	restart: { delayMs: 2 * SECOND_MS },
} as const;

export type OAuthProviderId = (typeof OAUTH_APPS.providers)[number];

export const OAUTH_APP_ENV_VARS = {
	google: {
		clientId: "GOOGLE_CLIENT_ID",
		clientSecret: "GOOGLE_CLIENT_SECRET",
		tenantId: null,
	},
	microsoft: {
		clientId: "MICROSOFT_CLIENT_ID",
		clientSecret: "MICROSOFT_CLIENT_SECRET",
		tenantId: "MICROSOFT_TENANT_ID",
	},
	slack: {
		clientId: "SLACK_CLIENT_ID",
		clientSecret: "SLACK_CLIENT_SECRET",
		tenantId: null,
	},
} as const;

export const OAUTH_APP_COLUMNS = {
	google: {
		clientId: "googleClientId",
		clientSecret: "googleClientSecret",
		tenantId: null,
	},
	microsoft: {
		clientId: "microsoftClientId",
		clientSecret: "microsoftClientSecret",
		tenantId: "microsoftTenantId",
	},
	slack: {
		clientId: "slackClientId",
		clientSecret: "slackClientSecret",
		tenantId: null,
	},
} as const;

export const OAUTH_APP_REDIRECT_PATHS = {
	google: "/api/auth/callback/google",
	microsoft: "/api/auth/callback/microsoft",
	slack: "/api/auth/oauth2/callback/slack",
} as const;

export interface StoredOAuthApp {
	clientId: string;
	clientSecret: string;
	tenantId: string | null;
}

export function sealOAuthAppSecret(secret: string): string {
	return sealSecret(secret, appSecretKey(OAUTH_APPS.purpose));
}

export function openOAuthAppSecret(stored: string): string {
	const value = stored.trim();
	if (!isSealedSecret(value)) return value;

	return openSecret(value, appSecretKey(OAUTH_APPS.purpose));
}

export interface OAuthAppRow {
	googleClientId: string | null;
	googleClientSecret: string | null;
	microsoftClientId: string | null;
	microsoftClientSecret: string | null;
	microsoftTenantId: string | null;
	slackClientId: string | null;
	slackClientSecret: string | null;
}

export const OAUTH_APP_SELECT = {
	googleClientId: true,
	googleClientSecret: true,
	microsoftClientId: true,
	microsoftClientSecret: true,
	microsoftTenantId: true,
	slackClientId: true,
	slackClientSecret: true,
} as const;

export function storedOAuthApp(
	row: OAuthAppRow | null,
	provider: OAuthProviderId,
): StoredOAuthApp | null {
	if (!row) return null;

	const columns = OAUTH_APP_COLUMNS[provider];
	const clientId = row[columns.clientId]?.trim();
	const sealed = row[columns.clientSecret]?.trim();
	if (!clientId || !sealed) return null;

	return {
		clientId,
		clientSecret: openOAuthAppSecret(sealed),
		tenantId: columns.tenantId
			? (row[columns.tenantId]?.trim() ?? null) || null
			: null,
	};
}
