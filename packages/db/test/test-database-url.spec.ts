import { describe, expect, it } from "bun:test";
import { testDatabaseUrl } from "../src/test-database";

describe("testDatabaseUrl", () => {
	it("refuses an unset variable instead of falling back", () => {
		expect(() => testDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is not set/);
		expect(() =>
			testDatabaseUrl({
				DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/crm",
			}),
		).toThrow(/never falls back/);
	});

	it("refuses a live database name", () => {
		expect(() =>
			testDatabaseUrl({
				TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/crm",
			}),
		).toThrow(/does not end in _test/);
	});

	it("returns a name that ends in _test", () => {
		const url = "postgresql://postgres:postgres@localhost:5432/crm_test";

		expect(testDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
		expect(testDatabaseUrl({ TEST_DATABASE_URL: `${url}?schema=public` })).toBe(
			`${url}?schema=public`,
		);
	});
});
