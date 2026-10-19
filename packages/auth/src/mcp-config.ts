const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const MCP_SCOPE = "crm:read";

export const MCP = {
	path: "/api/mcp",
	scopes: [MCP_SCOPE, "offline_access"],
	pages: { login: "/sign-in", consent: "/consent" },
	oauthPathPrefix: "/oauth2/",
	token: {
		accessSeconds: HOUR_SECONDS,
		refreshSeconds: 30 * DAY_SECONDS,
		codeSeconds: 10 * MINUTE_SECONDS,
	},
	rateLimit: {
		register: { window: MINUTE_SECONDS, max: 5 },
		token: { window: MINUTE_SECONDS, max: 30 },
		authorize: { window: MINUTE_SECONDS, max: 30 },
	},
	wellKnown: {
		authorizationServer: "/.well-known/oauth-authorization-server",
		protectedResource: "/.well-known/oauth-protected-resource",
	},
} as const;

export function mcpUrl(apiUrl: string): string {
	return `${apiUrl.replace(/\/+$/, "")}${MCP.path}`;
}

export function mcpAudiences(apiUrl: string): string[] {
	const base = apiUrl.replace(/\/+$/, "");
	return [...new Set([mcpUrl(base), base, new URL(base).origin])];
}
