import { describe, expect, it } from "bun:test";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";

const { excessReason, researchLimit } = await import(
	"../app/(app)/[slug]/settings/billing/billing"
);

const count = (value: number | null) =>
	value === null ? "No limit" : String(value);

const limits = {
	contacts: 2_000,
	mailboxes: 1,
	insightsPerMonth: 500,
	draftsPerMonth: 20,
	researchPerMonth: null,
	storageGb: null,
	companyResearch: false,
	aiIncluded: true,
};

describe("the company research row", () => {
	it("says not included on the trial, never no limit", () => {
		expect(researchLimit(translator({}), limits, count)).toBe("Not included");
		expect(researchLimit(translator(DICTIONARIES.de), limits, count)).toBe(
			"Nicht enthalten",
		);
	});

	it("says no limit only when the plan includes company research", () => {
		const t = translator({});
		expect(researchLimit(t, { ...limits, companyResearch: true }, count)).toBe(
			"No limit",
		);
		expect(
			researchLimit(
				t,
				{ ...limits, companyResearch: true, researchPerMonth: 50 },
				count,
			),
		).toBe("50");
	});
});

describe("the reason a plan is blocked", () => {
	it("names the count and the limit", () => {
		const number = new Intl.NumberFormat("en");
		expect(
			excessReason(translator({}), number, "Hosting", {
				counter: "contacts",
				used: 12_400,
				limit: 10_000,
			}),
		).toBe(
			"You have 12,400 contacts, archived ones included. Hosting allows 10,000.",
		);
	});
});
