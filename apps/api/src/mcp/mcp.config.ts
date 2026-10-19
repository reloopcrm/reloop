import { MCP as MCP_AUTH, MCP_SCOPE } from "@crm/auth/mcp-config";
import { REST_RATE_LIMIT } from "../http/http-config";

export const MCP = {
	path: MCP_AUTH.path,
	scope: MCP_SCOPE,
	scopes: MCP_AUTH.scopes,
	wellKnown: MCP_AUTH.wellKnown,
	authBasePath: "/api/auth",
	server: { name: "reloop-crm", version: "1.0.0" },
	rateLimit: REST_RATE_LIMIT.apiKey,
	limits: {
		search: { results: 10 },
		winBack: { rows: 25, maxRows: 100 },
		contact: { mails: 20, bodyChars: 4_000 },
		thread: { messages: 30, bodyChars: 4_000 },
		text: { maxChars: 200 },
	},
} as const;
