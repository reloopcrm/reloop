import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
	readFileSync(join(import.meta.dir, "..", path), "utf8");

describe("dialog layout at call sites", () => {
	it("the email draft dialog sizes itself with the container token", () => {
		const source = read("components/crm/email-draft-dialog.tsx");
		expect(source).toContain("sm:max-w-(--container-sheet)");
		expect(source).not.toContain("max-w-[640px]");
	});

	it("the add connection dialog has no hard-coded pixel offset", () => {
		const source = read(
			"app/(app)/[slug]/settings/connections/add-connection-dialog.tsx",
		);
		expect(source).not.toMatch(/left-\[/);
		expect(source).not.toMatch(/\d+px/);
	});
});
