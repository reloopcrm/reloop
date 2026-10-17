import { createHmac } from "node:crypto";
import { CLIENT_KEY_LENGTH } from "@crm/db/tracking";

export function clientKeyOf(
	address: string | null,
	secret: string,
): string | null {
	if (!address) return null;

	return createHmac("sha256", secret)
		.update(address)
		.digest("hex")
		.slice(0, CLIENT_KEY_LENGTH);
}
