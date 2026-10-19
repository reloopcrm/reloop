import { isLoopbackHost } from "@better-auth/core/utils/host";
import { cloud } from "@crm/db/cloud/scope";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { apiUrl } from "./env";
import { MCP, mcpUrl } from "./mcp-config";

const ISSUER_PARAM = "iss";
const LOCATION_HEADER = "location";
const FETCH_DEST_HEADER = "sec-fetch-dest";
const NAVIGATION_DEST = "document";

function apiBase(): string {
	return apiUrl.replace(/\/+$/, "");
}

export function issuerForm(url: string): string {
	const parsed = new URL(url);
	if (parsed.protocol !== "https:" && !isLoopbackHost(parsed.host)) {
		parsed.protocol = "https:";
	}
	parsed.search = "";
	parsed.hash = "";
	return parsed.toString().replace(/\/$/, "");
}

function rawAuthIssuer(): string {
	return `${apiBase()}${MCP.authBasePath}`;
}

export function authIssuer(): string {
	return issuerForm(rawAuthIssuer());
}

export function mcpAddress(): string {
	return `${apiBase()}${cloud.scopedPath(MCP.path)}`;
}

export function mcpIssuer(): string {
	return issuerForm(`${apiBase()}${cloud.scopedPath(MCP.authBasePath)}`);
}

export function protectedResourceMetadataUrl(): string {
	return `${apiBase()}${MCP.wellKnown.protectedResource}${cloud.scopedPath(MCP.path)}`;
}

export function canonicalMcpResource(resource: string): string {
	return resource === mcpAddress() ? mcpUrl(apiUrl) : resource;
}

type AuthorizationServerMetadata = { issuer: string };

export function scopeAuthorizationServer<T extends AuthorizationServerMetadata>(
	metadata: T,
	issuer: string,
): T {
	if (metadata.issuer === issuer) return metadata;

	const prefixes = [...new Set([metadata.issuer, rawAuthIssuer()])];
	const moved = (value: unknown): unknown => {
		if (typeof value !== "string") return value;
		const prefix = prefixes.find((candidate) => value.startsWith(candidate));
		return prefix === undefined
			? value
			: `${issuer}${value.slice(prefix.length)}`;
	};
	const scoped = Object.fromEntries(
		Object.entries(metadata).map(([key, value]) => [key, moved(value)]),
	) as T;

	return { ...scoped, issuer };
}

function withScopedIssuer(url: string, issuer: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.searchParams.get(ISSUER_PARAM) !== authIssuer()) return null;
	parsed.searchParams.set(ISSUER_PARAM, issuer);
	return parsed.toString();
}

function moveLocation(headers: Headers | undefined, issuer: string): void {
	const location = headers?.get(LOCATION_HEADER);
	const moved = location ? withScopedIssuer(location, issuer) : null;
	if (moved) headers?.set(LOCATION_HEADER, moved);
}

const redirectAnswer = (value: unknown): value is { url: string } =>
	typeof value === "object" &&
	value !== null &&
	"url" in value &&
	typeof value.url === "string";

function isNavigation(headers: Headers | undefined): boolean {
	return headers?.get(FETCH_DEST_HEADER) === NAVIGATION_DEST;
}

export const oauthRedirects = createAuthMiddleware(async (ctx) => {
	const issuer = mcpIssuer();
	const moving = issuer !== authIssuer();
	if (moving) moveLocation(ctx.context.responseHeaders, issuer);

	const returned = ctx.context.returned;
	if (returned instanceof APIError) {
		if (moving && returned.headers instanceof Headers) {
			moveLocation(returned.headers, issuer);
		}
		return;
	}
	if (!redirectAnswer(returned)) return;

	const url =
		(moving && withScopedIssuer(returned.url, issuer)) || returned.url;
	if (isNavigation(ctx.request?.headers)) throw ctx.redirect(url);
	if (url !== returned.url) return { ...returned, url };
});
