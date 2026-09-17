import { symmetricDecrypt } from "better-auth/crypto";
import { auth } from "./auth";

function isSealed(token: string): boolean {
	if (token.startsWith("$ba$")) return true;

	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

export async function openAccountToken(
	token: string | null | undefined,
): Promise<string | null> {
	if (!token) return null;

	const context = await auth.$context;
	if (!context.options.account?.encryptOAuthTokens) return token;

	return isSealed(token)
		? symmetricDecrypt({ key: context.secretConfig, data: token })
		: token;
}
