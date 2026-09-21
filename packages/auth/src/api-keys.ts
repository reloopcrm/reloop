import { randomBytes } from "node:crypto";
import { tenantId as tenantIdSchema } from "@crm/db/tenancy";
import { currentTenantId } from "@crm/db/tenant-context";

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_PREFIX = "crm_";

export const DAY_SECONDS = 24 * 60 * 60;

export const API_KEY_EXPIRATION = {
	minDays: 1,
	maxDays: 365,
} as const;

const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomKey(length: number): string {
	let key = "";
	for (const byte of randomBytes(length)) key += ALPHABET[byte % 62];
	return key;
}

export function generateApiKey(options: {
	length: number;
	prefix: string | undefined;
}): string {
	const tenantId = currentTenantId();
	const prefix = tenantId
		? `${API_KEY_PREFIX}${tenantId}_`
		: (options.prefix ?? "");
	return `${prefix}${randomKey(options.length)}`;
}

export function tenantIdFromApiKey(key: string | undefined): string | null {
	if (!key?.startsWith(API_KEY_PREFIX)) return null;

	const rest = key.slice(API_KEY_PREFIX.length);
	const separator = rest.indexOf("_");
	if (separator <= 0) return null;

	const tenantId = rest.slice(0, separator);
	return tenantIdSchema.safeParse(tenantId).success ? tenantId : null;
}
