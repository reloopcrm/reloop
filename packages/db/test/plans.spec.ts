import { describe, expect, it } from "bun:test";
import {
	allowsCompanyResearch,
	COMPANY_RESEARCH_KINDS,
	clampImportSince,
	clampResearchPerHour,
	limitsOf,
	NO_PLAN,
	PLAN_IDS,
	PLANS,
} from "../src/plans";

const now = new Date("2026-09-12T00:00:00.000Z");

describe("an install without a plan", () => {
	it("has no limit at all", () => {
		for (const plan of [null, undefined, ""]) {
			expect(limitsOf(plan)).toEqual(NO_PLAN);
		}
	});

	it("keeps the wanted import date, however old", () => {
		const old = new Date("2015-01-01T00:00:00.000Z");
		expect(clampImportSince(old, NO_PLAN, now)).toBe(old);
		expect(clampImportSince(null, NO_PLAN, now)).toBeNull();
	});

	it("keeps the research setting", () => {
		expect(clampResearchPerHour(500, NO_PLAN)).toBe(500);
		expect(clampResearchPerHour(null, NO_PLAN)).toBeNull();
	});

	it("allows every kind of task", () => {
		for (const kind of COMPANY_RESEARCH_KINDS) {
			expect(allowsCompanyResearch(kind, NO_PLAN)).toBe(true);
		}
	});
});

describe("the test plan", () => {
	it("limits an unknown plan instead of granting unlimited access", () => {
		expect(limitsOf("erfunden")).toEqual(PLANS.test);
	});
	const limits = PLANS.test;

	it("pulls at most six months of mail", () => {
		const floor = clampImportSince(null, limits, now);
		expect(floor?.toISOString()).toBe("2026-03-12T00:00:00.000Z");
	});

	it("refuses a wish for older mail", () => {
		const old = new Date("2019-01-01T00:00:00.000Z");
		expect(clampImportSince(old, limits, now)?.toISOString()).toBe(
			"2026-03-12T00:00:00.000Z",
		);
	});

	it("keeps a wish that is already inside the window", () => {
		const recent = new Date("2026-08-01T00:00:00.000Z");
		expect(clampImportSince(recent, limits, now)).toBe(recent);
	});

	it("caps the research setting and fills it in when unset", () => {
		expect(clampResearchPerHour(4000, limits)).toBe(5);
		expect(clampResearchPerHour(2, limits)).toBe(2);
		expect(clampResearchPerHour(null, limits)).toBe(5);
	});

	it("blocks the three expensive research kinds and nothing else", () => {
		for (const kind of COMPANY_RESEARCH_KINDS) {
			expect(allowsCompanyResearch(kind, limits)).toBe(false);
		}

		for (const kind of ["thread-insight", "identify", "email-draft"]) {
			expect(allowsCompanyResearch(kind, limits)).toBe(true);
		}
	});
});

describe("the monthly reading budget", () => {
	it("is open without a plan", () => {
		expect(NO_PLAN.insightsPerMonth).toBeNull();
	});

	it("is small on the test plan and large on the paid ones", () => {
		expect(PLANS.test.insightsPerMonth).toBe(300);
		expect(PLANS.handel.insightsPerMonth as number).toBeGreaterThan(
			PLANS.test.insightsPerMonth as number,
		);
		expect(PLANS["handel-plus"].insightsPerMonth).toBeNull();
	});
});

describe("the paid plans", () => {
	it("let the agent research companies", () => {
		expect(PLANS.handel.companyResearch).toBe(true);
		expect(PLANS["handel-plus"].companyResearch).toBe(true);
	});

	it("open the window wider as the price rises", () => {
		expect(PLANS.test.importMonths).toBeLessThan(
			PLANS.handel.importMonths as number,
		);
		expect(PLANS.handel.importMonths).toBeLessThan(
			PLANS["handel-plus"].importMonths as number,
		);
	});

	it("raise the research allowance as the price rises", () => {
		expect(PLANS.test.researchPerHour).toBeLessThan(
			PLANS.handel.researchPerHour as number,
		);
		expect(PLANS.handel.researchPerHour).toBeLessThan(
			PLANS["handel-plus"].researchPerHour as number,
		);
	});

	it("names every plan id it carries", () => {
		expect(Object.keys(PLANS).sort()).toEqual([...PLAN_IDS].sort());
	});
});
