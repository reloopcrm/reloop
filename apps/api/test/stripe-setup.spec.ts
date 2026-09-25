import { describe, expect, it } from "bun:test";
import { PORTAL_FEATURES } from "../scripts/stripe-setup";

describe("the customer portal", () => {
	it("lets a customer change the address and the tax ID", () => {
		expect(PORTAL_FEATURES.customer_update.enabled).toBe(true);
		expect(PORTAL_FEATURES.customer_update.allowed_updates).toEqual([
			"name",
			"email",
			"address",
			"tax_id",
		]);
	});

	it("keeps plan changes and cancellation out of the portal", () => {
		expect(PORTAL_FEATURES.subscription_update.enabled).toBe(false);
		expect(PORTAL_FEATURES.subscription_cancel.enabled).toBe(false);
	});
});
