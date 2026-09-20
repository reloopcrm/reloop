import { OAUTH_APPS } from "@crm/db/oauth-apps";
import { z } from "zod";

export const oauthAppProvider = z.enum(OAUTH_APPS.providers);

export const oauthAppInput = z.object({ provider: oauthAppProvider });

export const oauthAppStatusOutput = z.object({
	provider: oauthAppProvider,
	source: z.enum(["database", "environment", "none"]),
	clientId: z.string().nullable(),
	secretHint: z.string().nullable(),
	tenantId: z.string().nullable(),
	redirectUri: z.string(),
	environmentAlso: z.boolean(),
	canManage: z.boolean(),
});

export const oauthAppRestartOutput = z.object({
	status: z.enum(["started", "unavailable"]),
});

export const saveOAuthAppInput = z.object({
	provider: oauthAppProvider,
	clientId: z
		.string()
		.trim()
		.min(OAUTH_APPS.clientId.minLength)
		.max(OAUTH_APPS.clientId.maxLength),
	clientSecret: z
		.string()
		.trim()
		.min(OAUTH_APPS.clientSecret.minLength)
		.max(OAUTH_APPS.clientSecret.maxLength),
	tenantId: z.string().trim().max(OAUTH_APPS.tenantId.maxLength).optional(),
});

export type OAuthAppInput = z.infer<typeof oauthAppInput>;
export type OAuthAppStatus = z.infer<typeof oauthAppStatusOutput>;
export type OAuthAppRestart = z.infer<typeof oauthAppRestartOutput>;
export type SaveOAuthAppInput = z.infer<typeof saveOAuthAppInput>;
