import { describe, expect, it } from "bun:test";
import {
	DRAFT_STYLE,
	type DraftStyle,
	draftStylePrompt,
	EMPTY_DRAFT_STYLE,
	parseDraftStyle,
	withDraftStyleRule,
	withoutDraftStyleRule,
} from "../src/draft-style";

function rule(text: string, id = text) {
	return { id, text, learnedAt: "2026-09-11T00:00:00.000Z" };
}

function full(): DraftStyle {
	return {
		rules: Array.from({ length: DRAFT_STYLE.maxRules }, (_, index) =>
			rule(`Regel ${index}`),
		),
	};
}

describe("what the agent learned about my writing", () => {
	it("is empty when nothing is stored", () => {
		expect(parseDraftStyle(null)).toEqual(EMPTY_DRAFT_STYLE);
		expect(parseDraftStyle(undefined)).toEqual(EMPTY_DRAFT_STYLE);
		expect(parseDraftStyle({ rules: "broken" })).toEqual(EMPTY_DRAFT_STYLE);
	});

	it("reads back what was written", () => {
		const stored = { rules: [rule("Schreib kurz")] };

		expect(parseDraftStyle(stored)).toEqual(stored);
	});

	it("puts the newest rule first", () => {
		const style = withDraftStyleRule(
			{ rules: [rule("alt")] },
			rule("neu", "id-neu"),
		);

		expect(style.rules.map((entry) => entry.text)).toEqual(["neu", "alt"]);
	});

	it("never grows past the cap, so the context stays small", () => {
		const style = withDraftStyleRule(full(), rule("neu", "id-neu"));

		expect(style.rules).toHaveLength(DRAFT_STYLE.maxRules);
		expect(style.rules[0]?.text).toBe("neu");
		expect(style.rules.some((entry) => entry.text === "Regel 11")).toBe(false);
	});

	it("keeps one rule once, even when the agent says it twice", () => {
		const first = withDraftStyleRule(EMPTY_DRAFT_STYLE, rule("Kurz", "a"));
		const second = withDraftStyleRule(first, rule("  kurz  ", "b"));

		expect(second.rules).toHaveLength(1);
		expect(second.rules[0]?.id).toBe("b");
	});

	it("cuts a rule that is too long", () => {
		const long = "x".repeat(DRAFT_STYLE.ruleMaxChars + 50);
		const style = withDraftStyleRule(EMPTY_DRAFT_STYLE, rule(long, "a"));

		expect(style.rules[0]?.text).toHaveLength(DRAFT_STYLE.ruleMaxChars);
	});

	it("keeps an empty rule out", () => {
		expect(
			withDraftStyleRule(EMPTY_DRAFT_STYLE, rule("   ", "a")).rules,
		).toEqual([]);
	});

	it("forgets the rule I remove and keeps the rest", () => {
		const style = { rules: [rule("eins", "a"), rule("zwei", "b")] };

		expect(withoutDraftStyleRule(style, "a").rules.map((e) => e.id)).toEqual([
			"b",
		]);
	});

	it("says nothing to the model while no rule exists", () => {
		expect(draftStylePrompt(EMPTY_DRAFT_STYLE)).toBe("");
	});

	it("names every rule to the model", () => {
		const prompt = draftStylePrompt({
			rules: [rule("Kurz halten", "a"), rule("Kein Preis", "b")],
		});

		expect(prompt).toContain("Kurz halten");
		expect(prompt).toContain("Kein Preis");
	});

	it("stays small enough for a prompt when it is full", () => {
		const prompt = draftStylePrompt(full());

		expect(prompt.length).toBeLessThan(
			DRAFT_STYLE.maxRules * (DRAFT_STYLE.ruleMaxChars + 4) + 200,
		);
	});
});
