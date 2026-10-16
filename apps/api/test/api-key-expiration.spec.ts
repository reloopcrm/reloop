import { describe, expect, it } from "bun:test";
import { API_KEY_EXPIRATION, expirationDaysOf } from "@crm/auth/api-key-config";
import { createApiKeyInput } from "../src/api-keys/api-keys.contracts";

describe("the expiry choices the key sheet offers", () => {
	it("all pass the create input", () => {
		for (const choice of API_KEY_EXPIRATION.choices) {
			const parsed = createApiKeyInput.safeParse({
				name: "Preview",
				expiresInDays: expirationDaysOf(choice),
			});

			expect(parsed.success).toBe(true);
		}
	});

	it("starts on a choice the sheet offers", () => {
		expect(API_KEY_EXPIRATION.choices).toContain(
			API_KEY_EXPIRATION.defaultChoice,
		);
	});
});
