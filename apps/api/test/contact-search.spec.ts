import { describe, expect, it } from "bun:test";
import { contactSearchFilter } from "../src/contacts/contacts.service";

describe("the contact search", () => {
	it("finds a person by their full name, one word per field", () => {
		const where = contactSearchFilter("  Alex   Morgan ");
		const words = (where.AND as { OR: { firstName?: unknown }[] }[]).map(
			(clause) => clause.OR[0]?.firstName,
		);

		expect(words).toEqual([
			{ contains: "Alex", mode: "insensitive" },
			{ contains: "Morgan", mode: "insensitive" },
		]);
	});

	it("matches every word against name, email and company", () => {
		const where = contactSearchFilter("example.com");
		const [clause] = where.AND as { OR: unknown[] }[];

		expect(clause?.OR).toHaveLength(4);
	});

	it("filters nothing for an empty search", () => {
		expect(contactSearchFilter("   ")).toEqual({});
	});
});
