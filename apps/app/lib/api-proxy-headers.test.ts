import { describe, expect, it } from "bun:test";
import { proxyRequestHeaders, trustedClientAddress } from "./api-proxy-headers";

describe("trustedClientAddress", () => {
	it("takes the last hop, which the proxy appends", () => {
		expect(trustedClientAddress("203.0.113.9, 198.51.100.4")).toBe(
			"198.51.100.4",
		);
	});

	it("ignores a chain that ends in something that is not an address", () => {
		expect(trustedClientAddress("198.51.100.4, unknown")).toBeNull();
		expect(trustedClientAddress("")).toBeNull();
		expect(trustedClientAddress(null)).toBeNull();
	});

	it("keeps a single IPv6 hop", () => {
		expect(trustedClientAddress("2001:db8::1")).toBe("2001:db8::1");
	});
});

describe("proxyRequestHeaders", () => {
	it("forwards the last hop and not the address the caller wrote", () => {
		const headers = proxyRequestHeaders(
			new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.4" }),
		);

		expect(headers.get("x-forwarded-for")).toBe("198.51.100.4");
	});

	it("sends no address when the caller is the only hop and lies", () => {
		const headers = proxyRequestHeaders(
			new Headers({ "x-forwarded-for": "not-an-address" }),
		);

		expect(headers.has("x-forwarded-for")).toBe(false);
	});

	it("drops every other forwarding header", () => {
		const headers = proxyRequestHeaders(
			new Headers({
				"x-forwarded-for": "198.51.100.4",
				"x-forwarded-host": "evil.example",
				"x-forwarded-proto": "http",
				forwarded: "for=203.0.113.9",
				cookie: "session=1",
			}),
		);

		expect(headers.has("x-forwarded-host")).toBe(false);
		expect(headers.has("x-forwarded-proto")).toBe(false);
		expect(headers.has("forwarded")).toBe(false);
		expect(headers.get("cookie")).toBe("session=1");
	});
});
