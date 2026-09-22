import "@crm/env/load";

import { isHosted } from "@crm/db/tenant-context";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_MICROSOFT_TENANT = "common";

const storedValues = new Map<string, string>();

export function rememberStoredEnv(values: ReadonlyMap<string, string>): void {
	for (const [key, value] of values) {
		const trimmed = value.trim();
		if (trimmed.length > 0) storedValues.set(key, trimmed);
	}
	credentials = undefined;
}

export function storedEnv(key: string): string | undefined {
	return storedValues.get(key);
}

export function environmentOnly(key: string): string | undefined {
	const value = process.env[key];
	return value && value.length > 0 ? value : undefined;
}

const optional = (key: string): string | undefined =>
	storedValues.get(key) ?? environmentOnly(key);

const pair = (
	idKey: string,
	secretKey: string,
): { clientId: string; clientSecret: string } | undefined => {
	const clientId = optional(idKey);
	const clientSecret = optional(secretKey);

	if (!clientId || !clientSecret) {
		if (clientId || clientSecret) {
			console.warn(
				`${idKey} and ${secretKey} are incomplete; this provider is disabled.`,
			);
		}
		return undefined;
	}

	return { clientId, clientSecret };
};

const googleCredentials = ():
	| { clientId: string; clientSecret: string }
	| undefined => pair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");

const microsoftCredentials = ():
	| { clientId: string; clientSecret: string; tenantId: string }
	| undefined => {
	const credentials = pair("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET");
	if (!credentials) return undefined;

	return {
		...credentials,
		tenantId: optional("MICROSOFT_TENANT_ID") ?? DEFAULT_MICROSOFT_TENANT,
	};
};

const slackCredentials = ():
	| { clientId: string; clientSecret: string }
	| undefined => pair("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET");

interface OAuthCredentials {
	google: ReturnType<typeof googleCredentials>;
	microsoft: ReturnType<typeof microsoftCredentials>;
	slack: ReturnType<typeof slackCredentials>;
}

let credentials: OAuthCredentials | undefined;

const resolved = (): OAuthCredentials => {
	credentials ??= {
		google: googleCredentials(),
		microsoft: microsoftCredentials(),
		slack: slackCredentials(),
	};

	return credentials;
};

const apiUrl =
	environmentOnly("API_URL") ??
	environmentOnly("BETTER_AUTH_URL") ??
	DEFAULT_API_URL;

const appUrls = (environmentOnly("APP_URL") ?? DEFAULT_APP_URL)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const appUrl = appUrls[0] ?? DEFAULT_APP_URL;

export const env = {
	apiUrl,
	appUrl,
	get google() {
		return resolved().google;
	},
	get microsoft() {
		return resolved().microsoft;
	},
	get slack() {
		return resolved().slack;
	},
	get password() {
		return environmentOnly("PASSWORD_SIGN_IN") === "1" || isHosted();
	},
	cookieDomain: environmentOnly("AUTH_COOKIE_DOMAIN"),
	trustedOrigins: [...new Set([...appUrls, apiUrl])],
	secureCookies: appUrl.startsWith("https://"),
} as const;

export function isGoogleConfigured(): boolean {
	return env.google !== undefined;
}

export function isPasswordSignInConfigured(): boolean {
	return env.password;
}

export function isMicrosoftConfigured(): boolean {
	return env.microsoft !== undefined;
}

export function isSlackConfigured(): boolean {
	return env.slack !== undefined;
}

export { apiUrl, appUrl };
