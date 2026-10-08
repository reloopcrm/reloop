import { describe, expect, it } from "bun:test";
import { CLIENT_KEY_LENGTH } from "@crm/db/tracking";
import { clientKeyOf } from "../src/tracking/client-key";

const SECRET = "a-test-secret-that-is-long-enough-1234";

describe("the key a form limit counts a client by", () => {
	it("never carries the address it came from", () => {
		const key = clientKeyOf("203.0.113.7", SECRET);

		expect(key).not.toBeNull();
		expect(key).not.toContain("203.0.113.7");
		expect(key).toHaveLength(CLIENT_KEY_LENGTH);
	});

	it("is the same for one address and different for another", () => {
		expect(clientKeyOf("203.0.113.7", SECRET)).toBe(
			clientKeyOf("203.0.113.7", SECRET),
		);
		expect(clientKeyOf("203.0.113.7", SECRET)).not.toBe(
			clientKeyOf("203.0.113.8", SECRET),
		);
	});

	it("depends on the server secret, so a stranger cannot compute it", () => {
		expect(clientKeyOf("203.0.113.7", SECRET)).not.toBe(
			clientKeyOf("203.0.113.7", `${SECRET}-other`),
		);
	});

	it("is absent when the request carries no address", () => {
		expect(clientKeyOf(null, SECRET)).toBeNull();
	});
});
