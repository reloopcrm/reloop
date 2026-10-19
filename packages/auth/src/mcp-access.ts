import { createHash } from "node:crypto";
import { type Db, db as defaultDb } from "@crm/db";
import { MCP_SCOPE } from "./mcp-config";
import { isSignInAllowed } from "./sign-in-grants";

export type McpTokenHolder = {
	tokenId: string;
	clientId: string;
	userId: string;
	email: string;
};

export function hashOAuthToken(token: string): string {
	return createHash("sha256").update(token).digest("base64url");
}

export function bearerTokenOf(
	authorization: string | string[] | undefined,
): string | null {
	const header = Array.isArray(authorization)
		? authorization[0]
		: authorization;
	if (!header) return null;

	const [scheme, ...rest] = header.trim().split(/\s+/);
	if (scheme?.toLowerCase() !== "bearer") return null;

	const token = rest.join("");
	return token.length > 0 ? token : null;
}

type TokenStore = Pick<Db, "oauthAccessToken">;

export async function readMcpTokenHolder(
	token: string,
	database: TokenStore = defaultDb,
	now = new Date(),
): Promise<McpTokenHolder | null> {
	const row = await database.oauthAccessToken.findUnique({
		where: { token: hashOAuthToken(token) },
		select: {
			id: true,
			clientId: true,
			userId: true,
			scopes: true,
			expiresAt: true,
			user: { select: { email: true, removedAt: true } },
		},
	});

	if (!row?.userId || !row.user) return null;
	if (row.expiresAt <= now) return null;
	if (!row.scopes.includes(MCP_SCOPE)) return null;
	if (row.user.removedAt) return null;
	if (!(await isSignInAllowed(row.user.email))) return null;

	return {
		tokenId: row.id,
		clientId: row.clientId,
		userId: row.userId,
		email: row.user.email,
	};
}
