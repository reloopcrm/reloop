import { describe, expect, it } from "bun:test";
import { MEMORY } from "@crm/db/insights";
import { CONVERSATION_LANGUAGE } from "@crm/validation/agent-language";
import { clampAtWord } from "@crm/validation/summary-text";
import { summaryLanguage, summaryWrittenIn } from "../agent/lib/language";

describe("the language a thread summary is written in", () => {
	it("names the conversation's own language when no workspace language is known", () => {
		expect(summaryLanguage({})).toBe(CONVERSATION_LANGUAGE);
		expect(summaryWrittenIn(summaryLanguage({}))).toBe(
			"the language the conversation is written in",
		);
	});

	it("names German when the install says RELOOP_GERMAN", () => {
		expect(summaryLanguage({ RELOOP_GERMAN: "true" })).toBe("de");
		expect(summaryWrittenIn("de")).toBe("German");
	});

	it("names a stored workspace language in English for the prompt", () => {
		expect(summaryWrittenIn("fr")).toBe("French");
		expect(summaryWrittenIn("zh-Hans")).toBe("Simplified Chinese");
	});
});

describe("a clamped summary", () => {
	it("keeps a short text as it is", () => {
		expect(clampAtWord("  Die Paletten sind da.  ", 40)).toBe(
			"Die Paletten sind da.",
		);
	});

	it("never ends in the middle of a word", () => {
		const text =
			"Es ging um die Abholung von 300 verfügbaren Europaletten in Köln.";
		const clamped = clampAtWord(text, 48);

		expect(clamped).toBe("Es ging um die Abholung von 300 verfügbaren…");
		expect(clamped.length).toBeLessThanOrEqual(48);
	});

	it("fits the brief limit", () => {
		const long = "Wort ".repeat(200);
		const clamped = clampAtWord(long, MEMORY.briefMaxChars);

		expect(clamped.length).toBeLessThanOrEqual(MEMORY.briefMaxChars);
		expect(clamped.endsWith("Wort…")).toBe(true);
	});
});
