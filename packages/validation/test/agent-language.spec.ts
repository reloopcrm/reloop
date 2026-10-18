import { describe, expect, it } from "bun:test";
import {
	CONVERSATION_LANGUAGE,
	summaryIsStale,
	summaryLanguage,
} from "../src/agent-language";

describe("the language a summary is written in", () => {
	it("follows the workspace setting when one is stored", () => {
		expect(summaryLanguage("de", undefined)).toBe("de");
		expect(summaryLanguage("fr", "true")).toBe("fr");
		expect(summaryLanguage("en", "true")).toBe("en");
	});

	it("takes German from RELOOP_GERMAN when nothing is stored", () => {
		expect(summaryLanguage(null, "true")).toBe("de");
	});

	it("keeps the language of the conversation when the agent cannot know it", () => {
		for (const german of [undefined, "", "false", "TRUE"]) {
			expect(summaryLanguage(null, german)).toBe(CONVERSATION_LANGUAGE);
		}
	});

	it("marks a summary stale when it was written in another language or before tracking", () => {
		expect(summaryIsStale(null, "de")).toBe(true);
		expect(summaryIsStale(null, CONVERSATION_LANGUAGE)).toBe(true);
		expect(summaryIsStale("en", "de")).toBe(true);
		expect(summaryIsStale(CONVERSATION_LANGUAGE, "de")).toBe(true);
		expect(summaryIsStale("de", "de")).toBe(false);
		expect(summaryIsStale(CONVERSATION_LANGUAGE, CONVERSATION_LANGUAGE)).toBe(
			false,
		);
	});
});
