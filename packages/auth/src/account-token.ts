import { symmetricDecrypt } from "better-auth/crypto";
import { auth } from "./auth";
import { isSealedToken } from "./token-seal";

export async function openAccountToken(
	token: string | null | undefined,
): Promise<string | null> {
	if (!token) return null;

	const context = await auth.$context;
	if (!context.options.account?.encryptOAuthTokens) return token;

	return isSealedToken(token)
		? symmetricDecrypt({ key: context.secretConfig, data: token })
		: token;
}
