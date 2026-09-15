import { describe, expect, it } from "bun:test";
import { COMPANY, shortDescription } from "../agent/lib/company-config";

const LONG =
	"Ludwig Peetz Spedition (Ludwig Peetz GmbH & Co. KG) is a family owned transport and logistics provider with almost a century of experience. Based in Worms, the company runs a fleet of 60 trucks and operates three warehouses across the Rhine-Neckar region. It serves industrial clients throughout Europe.";

describe("how much of a vendor company text the record keeps", () => {
	it("keeps a short text untouched", () => {
		const text = "Spedition aus Worms mit 60 Lkw.";

		expect(shortDescription(text)).toBe(text);
	});

	it("keeps the first sentence of a long text", () => {
		const kept = shortDescription(LONG) ?? "";

		expect(kept).toContain("family owned transport and logistics provider");
		expect(kept).not.toContain("fleet of 60 trucks");
		expect(kept.length).toBeLessThanOrEqual(COMPANY.descriptionMaxChars);
	});

	it("never returns more than the cap", () => {
		const wall = "a".repeat(2_000);

		expect((shortDescription(wall) ?? "").length).toBeLessThanOrEqual(
			COMPANY.descriptionMaxChars,
		);
	});

	it("cuts on a word boundary when there is no sentence end", () => {
		const wall = `${"wort ".repeat(200)}ende`;
		const kept = shortDescription(wall) ?? "";

		expect(kept.endsWith(" ")).toBe(false);
		expect(kept).not.toContain("wor ");
	});

	it("keeps nothing when there is nothing", () => {
		expect(shortDescription(null)).toBeNull();
		expect(shortDescription("   ")).toBeNull();
	});

	it("keeps a first sentence that is itself too long, cut to the cap", () => {
		const one = `${"x".repeat(500)}.`;

		expect((shortDescription(one) ?? "").length).toBeLessThanOrEqual(
			COMPANY.descriptionMaxChars,
		);
	});
});
