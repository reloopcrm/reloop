import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { MODEL_PRICES } from "../src/model-prices";
import {
	allowsCompanyResearch,
	COMPANY_RESEARCH_KINDS,
	canonicalPlanId,
	clampImportSince,
	clampResearchPerHour,
	DRAFT_KIND,
	fixedAiFor,
	INSIGHT_KIND,
	isPlanId,
	LEGACY_PLAN_IDS,
	limitsOf,
	monthlyBudget,
	NO_PLAN,
	nextMonthStart,
	PLAN_IDS,
	PLANS,
	RESEARCH_RUN_KIND,
	startOfMonth,
	TRIAL_DAYS,
} from "../src/plans";

const now = new Date("2026-09-12T00:00:00.000Z");

const PRICING_PAGE = {
	start: {
		mailboxes: 1,
		insightsPerMonth: 1_000,
		draftsPerMonth: 40,
		contacts: 10_000,
	},
	standard: {
		mailboxes: 1,
		insightsPerMonth: 3_000,
		draftsPerMonth: 100,
		contacts: 25_000,
	},
	plus: {
		mailboxes: 2,
		insightsPerMonth: 7_000,
		draftsPerMonth: 300,
		contacts: 50_000,
	},
	team: {
		mailboxes: 4,
		insightsPerMonth: 18_000,
		draftsPerMonth: 800,
		contacts: 150_000,
	},
	office: {
		mailboxes: 8,
		insightsPerMonth: 45_000,
		draftsPerMonth: 2_000,
		contacts: 500_000,
	},
	hosting: {
		mailboxes: 2,
		insightsPerMonth: null,
		draftsPerMonth: null,
		contacts: 10_000,
		storageGb: 5,
	},
	"hosting-pro": {
		mailboxes: 6,
		insightsPerMonth: null,
		draftsPerMonth: null,
		contacts: 50_000,
		storageGb: 25,
	},
} as const;

describe("an install without a plan", () => {
	it("has no limit at all", () => {
		for (const plan of [null, undefined, ""]) {
			expect(limitsOf(plan)).toEqual(NO_PLAN);
		}
		for (const [key, value] of Object.entries(NO_PLAN)) {
			if (key === "label") continue;
			if (key === "aiIncluded") {
				expect(value).toBe(false);
				continue;
			}
			expect(value).toBe(key === "companyResearch" ? true : null);
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
		expect(monthlyBudget(INSIGHT_KIND, NO_PLAN)).toBeNull();
		expect(monthlyBudget(DRAFT_KIND, NO_PLAN)).toBeNull();
	});
});

describe("the pricing page", () => {
	for (const [id, expected] of Object.entries(PRICING_PAGE)) {
		it(`is what the ${id} plan enforces`, () => {
			expect(PLANS[id as keyof typeof PRICING_PAGE]).toMatchObject(expected);
		});
	}

	it("sells AI without a limit on the own key plans", () => {
		for (const id of ["hosting", "hosting-pro"] as const) {
			expect(PLANS[id].researchPerHour).toBeNull();
			expect(PLANS[id].companyResearch).toBe(true);
			expect(PLANS[id].aiIncluded).toBe(false);
		}
	});

	it("includes the AI on every other plan", () => {
		for (const id of [
			"trial",
			"start",
			"standard",
			"plus",
			"team",
			"office",
		] as const) {
			expect(PLANS[id].aiIncluded).toBe(true);
		}
	});

	it("prices Sol at the standard OpenRouter route", () => {
		expect(MODEL_PRICES["gpt-5.6-sol"]).toEqual({
			input: 2,
			cacheRead: 0.2,
			cacheWrite: 2.5,
			output: 10,
		});
	});

	it("counts a month from its first day in UTC", () => {
		expect(startOfMonth(now).toISOString()).toBe("2026-09-01T00:00:00.000Z");
		expect(nextMonthStart(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
		expect(monthlyBudget(RESEARCH_RUN_KIND, PLANS.trial)).toBeNull();
		expect(fixedAiFor("start")).toBe(false);
	});

	it("names every plan id it carries", () => {
		expect(Object.keys(PLANS).sort()).toEqual([...PLAN_IDS].sort());
	});
});

describe("the trial plan", () => {
	const limits = PLANS.trial;

	it("runs fourteen days with one mailbox and a thousand conversations", () => {
		expect(TRIAL_DAYS).toBe(14);
		expect(limits.mailboxes).toBe(1);
		expect(limits.insightsPerMonth).toBe(1_000);
	});

	it("imports the last ninety days and at most five hundred conversations", () => {
		expect(limits.importThreads).toBe(500);
		const floor = clampImportSince(null, limits, now);
		expect(floor?.toISOString()).toBe("2026-06-12T00:00:00.000Z");
	});

	it("refuses a wish for older mail", () => {
		const old = new Date("2019-01-01T00:00:00.000Z");
		expect(clampImportSince(old, limits, now)?.toISOString()).toBe(
			"2026-06-12T00:00:00.000Z",
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

		for (const kind of [INSIGHT_KIND, "identify", DRAFT_KIND]) {
			expect(allowsCompanyResearch(kind, limits)).toBe(true);
		}
	});

	it("is what an unknown plan id gets", () => {
		expect(limitsOf("erfunden")).toEqual(PLANS.trial);
	});
});

describe("the monthly budgets", () => {
	it("count conversations and drafts by task kind", () => {
		expect(monthlyBudget(INSIGHT_KIND, PLANS.standard)).toBe(3_000);
		expect(monthlyBudget(DRAFT_KIND, PLANS.standard)).toBe(100);
		expect(monthlyBudget("identify", PLANS.standard)).toBeNull();
	});
});

describe("the old plan ids", () => {
	it("map to the new plans", () => {
		expect(LEGACY_PLAN_IDS).toEqual({
			test: "trial",
			handel: "standard",
			"handel-plus": "team",
		});
		for (const [old, current] of Object.entries(LEGACY_PLAN_IDS)) {
			expect(isPlanId(old)).toBe(false);
			expect(canonicalPlanId(old)).toBe(current);
			expect(limitsOf(old)).toBe(PLANS[current]);
		}
	});

	it("are not offered as a choice", () => {
		for (const id of PLAN_IDS) expect(canonicalPlanId(id)).toBe(id);
		expect(canonicalPlanId("erfunden")).toBeNull();
		expect(canonicalPlanId(null)).toBeNull();
	});
});

describe("the contact trigger", () => {
	const sql = readFileSync(
		new URL(
			"../prisma/migrations/20260921120000_plan_ids/migration.sql",
			import.meta.url,
		),
		"utf8",
	);

	it("carries every plan's contact limit", () => {
		for (const id of PLAN_IDS) {
			expect(sql).toContain(`WHEN '${id}' THEN ${PLANS[id].contacts}`);
		}
		expect(sql).toContain(`ELSE ${PLANS.trial.contacts} END`);
	});

	it("moves every old id to its new plan", () => {
		for (const [old, current] of Object.entries(LEGACY_PLAN_IDS)) {
			expect(sql).toContain(`WHEN '${old}' THEN '${current}'`);
		}
	});
});
