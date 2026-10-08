import { describe, expect, it } from "bun:test";
import { RESEARCH } from "../agent/lib/research-config";

describe("research config values", () => {
	it("keeps the session budget and what one outside call costs", () => {
		expect(RESEARCH.budget.defaultUnits).toBe(4);
		expect(RESEARCH.budget.maxUnits).toBe(20);
		expect(RESEARCH.cost.webQuestion).toBe(1);
		expect(RESEARCH.cost.deepWebQuestion).toBe(2);
		expect(RESEARCH.cost.socialSearch).toBe(1);
		expect(RESEARCH.cost.socialCheck).toBe(1);
		expect(RESEARCH.cost.siteBrief).toBe(1);
	});

	it("keeps the outside call deadlines", () => {
		expect(RESEARCH.perplexity.timeoutMs).toBe(45_000);
		expect(RESEARCH.socials.github.timeoutMs).toBe(15_000);
	});

	it("keeps the recheck window and the lookup limits", () => {
		expect(RESEARCH.recheck.dayMs).toBe(86_400_000);
		expect(RESEARCH.recheck.minDays).toBe(1);
		expect(RESEARCH.recheck.maxDays).toBe(730);
		expect(RESEARCH.lookup.dayMs).toBe(86_400_000);
		expect(RESEARCH.lookup.deals).toEqual({ defaultLimit: 50, maxLimit: 100 });
		expect(RESEARCH.lookup.search.defaultLimit).toBe(10);
	});

	it("keeps the brief length bounds", () => {
		expect(RESEARCH.brief.narrativeMinChars).toBe(40);
		expect(RESEARCH.brief.narrativeMaxChars).toBe(400);
	});
});
