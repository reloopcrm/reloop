import { describe, expect, it } from "bun:test";
import { parseArgs, USAGE } from "../scripts/import-single-tenant";

describe("the import command line", () => {
	it("reads the dump, the tenant, the slug and the sign-in list", () => {
		expect(
			parseArgs([
				"--dump",
				"/tmp/reloop.sql",
				"--tenant",
				"acme",
				"--slug",
				"acme-gmbh",
				"--sign-in",
				"Owner@Acme.example, @acme.example",
				"--dry-run",
			]),
		).toEqual({
			dump: "/tmp/reloop.sql",
			tenant: "acme",
			slug: "acme-gmbh",
			signIn: ["owner@acme.example", "acme.example"],
			dryRun: true,
		});
	});

	it("refuses a missing value, an unknown flag and the old secret as a flag", () => {
		const base = ["--dump", "a.sql", "--tenant", "acme", "--slug", "acme"];
		expect(() => parseArgs(base)).toThrow(USAGE);
		expect(() =>
			parseArgs([...base, "--sign-in", "a@b.example", "--old-secret", "x"]),
		).toThrow(USAGE);
		expect(() => parseArgs([...base, "--sign-in"])).toThrow(USAGE);
	});
});
