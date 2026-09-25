import { createHmac, timingSafeEqual } from "node:crypto";
import { tenantId as tenantIdSchema } from "@crm/db/tenancy";
import { TENANT_COOKIE, TENANT_COOKIE_NAME } from "./cookies";

function signature(tenantId: string, secret: string): string {
	return createHmac("sha256", secret)
		.update(`${TENANT_COOKIE_NAME}:${tenantId}`)
		.digest("base64url");
}

export function tenantCookieValue(tenantId: string, secret: string): string {
	return `${tenantId}.${signature(tenantId, secret)}`;
}

export function readTenantCookie(
	value: string | undefined,
	secret: string,
): string | null {
	if (!value) return null;

	const separator = value.indexOf(".");
	if (separator <= 0) return null;

	const tenantId = value.slice(0, separator);
	const given = Buffer.from(value.slice(separator + 1));
	if (!tenantIdSchema.safeParse(tenantId).success) return null;

	const expected = Buffer.from(signature(tenantId, secret));
	if (given.length !== expected.length) return null;

	return timingSafeEqual(given, expected) ? tenantId : null;
}

export function tenantCookieHeader(
	tenantId: string,
	secret: string,
	options: { secure: boolean; domain?: string },
): string {
	const parts = [
		`${TENANT_COOKIE_NAME}=${tenantCookieValue(tenantId, secret)}`,
		"Path=/",
		`Max-Age=${TENANT_COOKIE.maxAgeSeconds}`,
		"HttpOnly",
		"SameSite=Lax",
	];
	if (options.secure) parts.push("Secure");
	if (options.domain) parts.push(`Domain=${options.domain}`);
	return parts.join("; ");
}

export function clearedTenantCookieHeader(options: {
	secure: boolean;
	domain?: string;
}): string {
	const parts = [
		`${TENANT_COOKIE_NAME}=`,
		"Path=/",
		"Max-Age=0",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (options.secure) parts.push("Secure");
	if (options.domain) parts.push(`Domain=${options.domain}`);
	return parts.join("; ");
}

export function cookieValue(
	header: string | undefined,
	name: string,
): string | undefined {
	if (!header) return undefined;

	for (const part of header.split(";")) {
		const separator = part.indexOf("=");
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() !== name) continue;
		return decodeURIComponent(part.slice(separator + 1).trim());
	}

	return undefined;
}
