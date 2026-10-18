import { describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import { BRAND } from "@crm/ui/lib/brand";
import { workspaceLabel } from "../lib/workspace-label";

describe("what the header calls this install", () => {
	it("says the product name once before anybody has named the workspace", () => {
		expect(workspaceLabel(DEFAULT_WORKSPACE_NAME)).toBe(BRAND.name);
	});

	it("falls back to the product name while the workspace is still loading", () => {
		expect(workspaceLabel(undefined)).toBe(BRAND.name);
		expect(workspaceLabel("")).toBe(BRAND.name);
		expect(workspaceLabel("   ")).toBe(BRAND.name);
	});

	it("says only the company name once it has one", () => {
		expect(workspaceLabel("Acme")).toBe("Acme");
		expect(workspaceLabel("  Acme  ")).toBe("Acme");
		expect(workspaceLabel("Nordlicht Handel GmbH")).toBe(
			"Nordlicht Handel GmbH",
		);
	});

	it("never appends the product name to the company", () => {
		expect(workspaceLabel("Acme")).not.toContain(BRAND.name);
	});

	it("leaves a company that carries the product name in its own name", () => {
		expect(workspaceLabel(`Acme ${BRAND.name}`)).toBe(`Acme ${BRAND.name}`);
	});
});
