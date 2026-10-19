import { cloud } from "@crm/db/cloud/scope";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { apiUrl } from "./env";
import { MCP, mcpUrl } from "./mcp-config";

const ISSUER_PARAM = "iss";
const LOCATION_HEADER = "location";

function apiBase(): string {
	return apiUrl.replace(/\/+$/, "");
}

export function authIssuer(): string {
	return `${apiBase()}${MCP.authBasePath}`;
}

export function mcpAddress(): string {
	return `${apiBase()}${cloud.scopedPath(MCP.path)}`;
}

export function mcpIssuer(): string {
	return `${apiBase()}${cloud.scopedPath(MCP.authBasePath)}`;
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

	const scoped = Object.fromEntries(
		Object.entries(metadata).map(([key, value]) => [
			key,
			typeof value === "string" && value.startsWith(metadata.issuer)
				? `${issuer}${value.slice(metadata.issuer.length)}`
				: value,
		]),
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

export const scopedIssuerRedirect = createAuthMiddleware(async (ctx) => {
	const issuer = mcpIssuer();
	if (issuer === authIssuer()) return;

	moveLocation(ctx.context.responseHeaders, issuer);

	const returned = ctx.context.returned;
	if (returned instanceof APIError) {
		moveLocation(
			returned.headers instanceof Headers ? returned.headers : undefined,
			issuer,
		);
		return;
	}
	if (!redirectAnswer(returned)) return;
	const moved = withScopedIssuer(returned.url, issuer);
	if (moved) return { ...returned, url: moved };
});
