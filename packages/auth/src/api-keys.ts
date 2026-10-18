import { randomInt } from "node:crypto";
import { cloud } from "@crm/db/cloud/scope";

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
	const tenantId = cloud.scopeId();
	const prefix = tenantId
		? `${API_KEY_PREFIX}${tenantId}_`
		: (options.prefix ?? "");
	return `${prefix}${randomKey(options.length)}`;
}
