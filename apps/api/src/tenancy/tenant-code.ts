import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { TenantCodePurpose } from "@crm/db/tenant-codes";
import { SIGNUP } from "./tenancy.config";

export function generateCode(): string {
	return String(randomInt(0, 10 ** SIGNUP.code.digits)).padStart(
		SIGNUP.code.digits,
		"0",
	);
}

export function hashCode(
	email: string,
	purpose: TenantCodePurpose,
	code: string,
): string {
	return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
		.update(`${email}:${purpose}:${code}`)
		.digest("base64url");
}

export function codeMatches(
	email: string,
	purpose: TenantCodePurpose,
	code: string,
	codeHash: string,
): boolean {
	const given = Buffer.from(hashCode(email, purpose, code));
	const stored = Buffer.from(codeHash);
	return given.length === stored.length && timingSafeEqual(given, stored);
}
