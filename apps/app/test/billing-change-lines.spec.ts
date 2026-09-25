import { describe, expect, it } from "bun:test";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";

const { planChangeLines } = await import(
	"../app/(app)/[slug]/settings/billing/billing"
);

const change = {
	price: "49 €",
	interval: "month" as const,
	effectiveAt: null,
	scheduled: { at: "2026-11-01T00:00:00.000Z" },
	replaced: false,
};

describe("the lines of the plan change dialog", () => {
	it("says the scheduled changes stay while the preview loads", () => {
		const lines = planChangeLines(translator(DICTIONARIES.de), "de", {
			...change,
			failed: false,
		});
		expect(lines).toEqual([
			"Neuer Preis: 49 € pro Monat, monatlich abgerechnet.",
			"Deine für den 1. November 2026 geplanten Änderungen bleiben.",
		]);
	});

	it("drops that line when the preview failed", () => {
		const lines = planChangeLines(translator(DICTIONARIES.de), "de", {
			...change,
			failed: true,
		});
		expect(lines).toEqual([
			"Neuer Preis: 49 € pro Monat, monatlich abgerechnet.",
		]);
		expect(lines.join(" ")).not.toContain("geplanten Änderungen bleiben");
	});

	it("names the replaced plan in English", () => {
		const lines = planChangeLines(translator({}), "en", {
			...change,
			interval: "year",
			replaced: true,
			failed: false,
		});
		expect(lines[1]).toBe(
			"The plan scheduled for November 1, 2026 is replaced. Your scheduled add-on changes stay.",
		);
	});
});
