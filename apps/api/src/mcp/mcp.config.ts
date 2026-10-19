import { MCP as MCP_AUTH, MCP_SCOPE } from "@crm/auth/mcp-config";
import { REST_RATE_LIMIT } from "../http/http-config";

const AUTH_BASE_PATH = "/api/auth";

export const MCP = {
	path: MCP_AUTH.path,
	scope: MCP_SCOPE,
	scopes: MCP_AUTH.scopes,
	wellKnown: MCP_AUTH.wellKnown,
	authBasePath: AUTH_BASE_PATH,
	server: { name: "reloop-crm", version: "1.0.0" },
	rateLimit: REST_RATE_LIMIT.apiKey,
	resource: {
		name: "Reloop CRM",
		bearerMethods: ["header"],
	},
	wellKnownRoutes: {
		authorizationServer: [
			MCP_AUTH.wellKnown.authorizationServer,
			`${MCP_AUTH.wellKnown.authorizationServer}${AUTH_BASE_PATH}`,
		],
		protectedResource: [
			MCP_AUTH.wellKnown.protectedResource,
			`${MCP_AUTH.wellKnown.protectedResource}${MCP_AUTH.path}`,
		],
	},
	http: {
		allowOrigin: "*",
		cacheControl: "no-store",
		allow: "POST",
		wwwAuthenticateHeader: "WWW-Authenticate",
		exposeHeadersHeader: "Access-Control-Expose-Headers",
		allowOriginHeader: "Access-Control-Allow-Origin",
		cacheControlHeader: "Cache-Control",
		allowHeader: "Allow",
	},
	jsonRpc: {
		version: "2.0",
		unauthorized: { code: -32000, message: "Unauthorized" },
		methodNotAllowed: {
			code: -32000,
			message: "Method not allowed. This server is stateless: send POST.",
		},
		tooManyRequests: { code: -32000, message: REST_RATE_LIMIT.message },
		internal: { code: -32603, message: "Internal server error" },
		parseError: {
			code: -32700,
			message: "Parse error",
			bodyParserType: "entity.parse.failed",
		},
		invalidBody: { code: -32600, message: "Invalid request body" },
	},
	messages: {
		toolFailed: "The CRM could not answer this request. Try again later.",
		unknownRecord:
			'Unknown id. Use an id from the search tool, for example "contact:abc123".',
	},
	record: {
		separator: ":",
		kinds: ["company", "contact", "deal"],
		appPaths: { company: "companies", contact: "contacts", deal: "deals" },
	},
	limits: {
		search: { results: 10, queryChars: 200 },
		winBack: { rows: 25, maxRows: 100, queryChars: 200 },
		contact: { mails: 20, bodyChars: 4_000, deals: 20, facts: 20 },
		thread: { messages: 30, bodyChars: 4_000, recipients: 20 },
		draft: { bodyChars: 8_000 },
		fetch: { textChars: 8_000 },
		summary: { maxChars: 2_000 },
		text: { maxChars: 200 },
		id: { maxChars: 200 },
	},
} as const;

export type McpRecordKind = (typeof MCP.record.kinds)[number];
