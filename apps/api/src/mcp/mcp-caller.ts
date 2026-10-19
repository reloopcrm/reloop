import {
	API_KEY_HEADER,
	auth,
	bearerTokenOf,
	isSignInAllowed,
	readMcpTokenHolder,
} from "@crm/auth";
import type { Db } from "@crm/db";
import type { Request } from "express";
import { storeKeyOf } from "../http/rest-rate-limit.middleware";

export type McpCredential = "oauth" | "api-key";

export type McpCaller = {
	userId: string;
	email: string;
	credential: McpCredential;
	limitKey: string | null;
};

function headerOf(value: string | string[] | undefined): string | null {
	const header = Array.isArray(value) ? value[0] : value;
	return header ? header : null;
}

async function bearerCaller(
	token: string,
	database: Db,
): Promise<McpCaller | null> {
	const holder = await readMcpTokenHolder(token, database);
	if (!holder) return null;

	return {
		userId: holder.userId,
		email: holder.email,
		credential: "oauth",
		limitKey: storeKeyOf(holder.tokenId),
	};
}

async function apiKeyCaller(
	key: string,
	database: Db,
): Promise<McpCaller | null> {
	const session = await auth.api
		.getSession({ headers: new Headers({ [API_KEY_HEADER]: key }) })
		.catch(() => null);
	if (!session?.user) return null;

	const user = await database.user.findUnique({
		where: { id: session.user.id },
		select: { id: true, email: true, removedAt: true },
	});
	if (!user || user.removedAt) return null;
	if (!(await isSignInAllowed(user.email, database))) return null;

	return {
		userId: user.id,
		email: user.email,
		credential: "api-key",
		limitKey: null,
	};
}

export async function resolveMcpCaller(
	req: Request,
	database: Db,
): Promise<McpCaller | null> {
	const authorization = headerOf(req.headers.authorization);
	if (authorization) {
		const token = bearerTokenOf(authorization);
		return token ? bearerCaller(token, database) : null;
	}

	const key = headerOf(req.headers[API_KEY_HEADER]);
	return key ? apiKeyCaller(key, database) : null;
}
