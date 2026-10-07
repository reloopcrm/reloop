import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { MODEL_PRICES } from "../src/model-prices";
import { fixedAiFor, usageLines } from "../src/plan-usage";
import {
	allowsCompanyResearch,
	budgetKinds,
	COMPANY_RESEARCH_KINDS,
	CONTACT_LIMIT_MESSAGE,
	capacityExcess,
	clampImportSince,
	clampResearchPerHour,
	DRAFT_KIND,
	forwardReserve,
	INSIGHT_KIND,
	keepsReserve,
	monthlyBudget,
	NO_PLAN,
	nextMonthStart,
	RESEARCH_RUN_KIND,
	STORY_KIND,
	startOfMonth,
} from "../src/plans";
import { TEST_PLANS } from "../src/test-plans";

const now = new Date("2026-09-12T00:00:00.000Z");

const NO_USAGE = {
	insights: 0,
	drafts: 0,
	sessions: 0,
	research: 0,
	chat: 0,
	builder: 0,
};

describe("an install without a plan", () => {
	it("has no limit at all", () => {
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

	it("never fixes the AI chain outside a hosted customer", () => {
		expect(fixedAiFor("small")).toBe(false);
		expect(fixedAiFor(null)).toBe(false);
	});

	it("holds no capacity excess", () => {
		expect(
			capacityExcess({ contacts: 1_000_000, mailboxes: 9 }, NO_PLAN),
		).toEqual([]);
	});
});

describe("a plan with limits", () => {
	const limits = TEST_PLANS.small;

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
	});

	it("imports the last months and at most the allowed conversations", () => {
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

	it("reports the counters past their limit", () => {
		expect(capacityExcess({ contacts: 2_001, mailboxes: 1 }, limits)).toEqual([
			{ counter: "contacts", used: 2_001, limit: 2_000 },
		]);
	});
});

describe("the monthly budgets", () => {
	it("count conversations and drafts by task kind", () => {
		expect(monthlyBudget(INSIGHT_KIND, TEST_PLANS.wide)).toBe(7_000);
		expect(monthlyBudget(DRAFT_KIND, TEST_PLANS.wide)).toBe(300);
		expect(monthlyBudget(RESEARCH_RUN_KIND, TEST_PLANS.wide)).toBe(300);
		expect(monthlyBudget(RESEARCH_RUN_KIND, TEST_PLANS.small)).toBeNull();
		expect(monthlyBudget("identify", TEST_PLANS.wide)).toBeNull();
	});
});

describe("the usage lines", () => {
	it("say company research is not included where the plan excludes it", () => {
		const lines = usageLines(NO_USAGE, TEST_PLANS.small);
		expect(lines.find((line) => line.counter === "research")).toEqual({
			counter: "research",
			used: 0,
			limit: null,
			included: false,
			reached: false,
		});
		expect(lines.find((line) => line.counter === "sessions")).toMatchObject({
			limit: 100,
			included: true,
		});
		expect(lines.find((line) => line.counter === "builder")).toMatchObject({
			limit: 100,
			included: true,
		});
	});

	it("keep no limit only where the plan has none", () => {
		for (const line of usageLines(NO_USAGE, NO_PLAN)) {
			expect(line).toMatchObject({ limit: null, included: true });
		}
		const wide = usageLines(NO_USAGE, TEST_PLANS.wide);
		expect(wide.find((line) => line.counter === "chat")).toMatchObject({
			limit: 3_000,
			included: true,
		});
		const keyless = usageLines(NO_USAGE, TEST_PLANS.keyless);
		expect(keyless.find((line) => line.counter === "sessions")).toMatchObject({
			limit: null,
			included: true,
		});
	});

	it("mark a counter reached at its limit", () => {
		const lines = usageLines({ ...NO_USAGE, builder: 100 }, TEST_PLANS.small);
		expect(lines.find((line) => line.counter === "builder")?.reached).toBe(
			true,
		);
	});
});

describe("the contact trigger", () => {
	const sql = readFileSync(
		new URL(
			"../prisma/migrations/20261008100000_contact_limit_from_column/migration.sql",
			import.meta.url,
		),
		"utf8",
	);

	it("reads the stored contact limit and names no plan", () => {
		expect(sql).toContain('RETURNING "contactLimit" INTO contact_limit');
		expect(sql).toContain("IF contact_limit IS NOT NULL");
		expect(sql).not.toMatch(/WHEN '[a-z-]+' THEN \d+/);
		expect(sql).not.toContain("current_plan");
	});

	it("raises the message the services match on", () => {
		expect(sql).toContain(`RAISE EXCEPTION '${CONTACT_LIMIT_MESSAGE}'`);
		expect(sql).toContain("ERRCODE = '23514'");
	});
});

describe("the reading reserve for new mail", () => {
	it("holds a fifth of the reading budget", () => {
		expect(
			forwardReserve(INSIGHT_KIND, { ...NO_PLAN, insightsPerMonth: 100 }),
		).toBe(20);
	});

	it("holds nothing without a limit or for other kinds", () => {
		expect(forwardReserve(INSIGHT_KIND, NO_PLAN)).toBe(0);
		expect(forwardReserve(DRAFT_KIND, TEST_PLANS.small)).toBe(0);
	});
});

describe("a win back story", () => {
	it("spends the conversation budget of the plan", () => {
		expect(monthlyBudget(STORY_KIND, TEST_PLANS.small)).toBe(
			TEST_PLANS.small.insightsPerMonth,
		);
		expect(monthlyBudget(STORY_KIND, NO_PLAN)).toBeNull();
	});

	it("is counted together with the conversations read", () => {
		expect(budgetKinds(STORY_KIND)).toEqual([INSIGHT_KIND, STORY_KIND]);
		expect(budgetKinds(INSIGHT_KIND)).toEqual([INSIGHT_KIND, STORY_KIND]);
		expect(budgetKinds(DRAFT_KIND)).toEqual([DRAFT_KIND]);
	});

	it("leaves the reserve for new mail alone, like a backfill", () => {
		expect(forwardReserve(STORY_KIND, TEST_PLANS.small)).toBe(
			forwardReserve(INSIGHT_KIND, TEST_PLANS.small),
		);
		expect(keepsReserve(STORY_KIND, "forward")).toBe(true);
		expect(keepsReserve(INSIGHT_KIND, "forward")).toBe(false);
		expect(keepsReserve(INSIGHT_KIND, "backfill")).toBe(true);
		expect(keepsReserve(DRAFT_KIND, "forward")).toBe(false);
	});
});
