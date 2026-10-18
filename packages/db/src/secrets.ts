import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const SEALED = {
	version: "v1",
	algorithm: "aes-256-gcm",
	ivBytes: 12,
} as const;

export function secretKey(secret: string, purpose: string): Buffer {
	return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

export function sealSecret(plain: string, key: Buffer): string {
	const iv = randomBytes(SEALED.ivBytes);
	const cipher = createCipheriv(SEALED.algorithm, key, iv);
	const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [
		SEALED.version,
		iv.toString("base64"),
		tag.toString("base64"),
		data.toString("base64"),
	].join(".");
}

export function isSealedSecret(value: string): boolean {
	return /^v\d+(?:\.|$)/.test(value);
}

export function openSecret(sealed: string, key: Buffer): string {
	const [version, iv, tag, data, extra] = sealed.split(".");

	if (
		version !== SEALED.version ||
		!iv ||
		!tag ||
		data === undefined ||
		extra !== undefined
	) {
		throw new Error("The stored secret has an unknown format.");
	}

	const decipher = createDecipheriv(
		SEALED.algorithm,
		key,
		Buffer.from(iv, "base64"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64"));

	return Buffer.concat([
		decipher.update(Buffer.from(data, "base64")),
		decipher.final(),
	]).toString("utf8");
}

export function appSecretKey(purpose: string): Buffer {
	const secret = process.env.BETTER_AUTH_SECRET?.trim();
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET is not set, so secrets cannot be read.",
		);
	}

	return secretKey(secret, purpose);
}
