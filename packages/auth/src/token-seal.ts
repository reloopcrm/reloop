import {
	parseEnvelope,
	symmetricDecrypt,
	symmetricEncrypt,
} from "better-auth/crypto";

export function isSealedToken(token: string): boolean {
	if (token.startsWith("$ba$")) return true;

	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

export async function openToken(
	token: string,
	secret: string,
): Promise<string> {
	const envelope = parseEnvelope(token);
	return symmetricDecrypt({
		key: secret,
		data: envelope ? envelope.ciphertext : token,
	});
}

export async function resealToken(
	token: string,
	oldSecret: string,
	newSecret: string,
): Promise<string> {
	return symmetricEncrypt({
		key: newSecret,
		data: await openToken(token, oldSecret),
	});
}
