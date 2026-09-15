import { describe, expect, it } from "bun:test";
import {
	REASONS,
	RUN_FAILED_WITHOUT_REASON,
	runFailureReason,
} from "../lib/agent-run-failure";
import { de } from "../lib/i18n/de";
import { translator } from "../lib/i18n/locale";

const DASHES = /[—–―‒]/;
const COVERED_SENTENCES = 16;

const german = translator("de", de);

const sentences: Array<[string, string]> = [
	...Object.entries(REASONS),
	["NO_CODE_AT_ALL", RUN_FAILED_WITHOUT_REASON],
];

describe("the German explanation for a failed run", () => {
	it("covers every failure code", () => {
		expect(sentences.length).toBeGreaterThanOrEqual(COVERED_SENTENCES);
	});

	for (const [code, english] of sentences) {
		it(`exists for ${code}`, () => {
			const translated = de[english];

			expect(translated).toBeDefined();
			expect(translated?.trim()).not.toBe("");
			expect(translated).not.toBe(english);
		});

		it(`reads as German for ${code}`, () => {
			expect(runFailureReason(code, null, german)).toBe(de[english] ?? "");
		});

		it(`uses no dash character for ${code}`, () => {
			expect(DASHES.test(de[english] ?? "")).toBe(false);
		});
	}

	it("falls back to the German sentence when no code is given", () => {
		expect(runFailureReason(null, null, german)).toBe(
			de[RUN_FAILED_WITHOUT_REASON] ?? "",
		);
	});

	it("keeps the English sentence in English", () => {
		const english = translator("en", de);

		expect(runFailureReason("MODEL_UNAVAILABLE", null, english)).toBe(
			REASONS.MODEL_UNAVAILABLE ?? "",
		);
	});
});
