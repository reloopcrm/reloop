import { describe, expect, it } from "bun:test";
import { ownDomainsOf } from "../agent/lib/contact-prune";

describe("ownDomainsOf", () => {
	it("keeps work domains and drops freemail", () => {
		expect([
			...ownDomainsOf(["x@gmail.com", "y@acme.de", "https://www.acme.de"]),
		]).toEqual(["acme.de"]);
	});

	it("drops every freemail domain", () => {
		const domains = ownDomainsOf([
			"a@gmx.de",
			"b@web.de",
			"c@yahoo.co.jp",
			"d@pm.me",
			null,
		]);

		expect(domains.size).toBe(0);
	});
});
