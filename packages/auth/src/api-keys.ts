import { randomInt } from "node:crypto";
import { tenantId as tenantIdSchema } from "@crm/db/tenancy";
import { currentTenantId } from "@crm/db/tenant-context";

import { API_KEY_PREFIX } from "./api-key-config";

export {
	API_KEY_EXPIRATION,
	API_KEY_HEADER,
	API_KEY_PREFIX,
	DAY_SECONDS,
} from "./api-key-config";

const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomKey(length: number): string {
	let key = "";
	for (let index = 0; index < length; index += 1) {
		key += ALPHABET[randomInt(ALPHABET.length)];
	}
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
