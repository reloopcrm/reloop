import { describe, expect, it } from "bun:test";
import {
	BUSINESS_STEP,
	businessDraftPossible,
	readingBusinessDraft,
} from "../app/(landing)/onboarding/business/business-config";

const NO_AI = {
	fixed: false,
	openrouterKey: false,
	openaiKey: false,
	anthropicKey: false,
	chatgpt: false,
};

describe("businessDraftPossible", () => {
	it("is false while no model provider is set up", () => {
		expect(businessDraftPossible(NO_AI)).toBe(false);
	});

	it("is true for the AI a plan includes", () => {
		expect(businessDraftPossible({ ...NO_AI, fixed: true })).toBe(true);
	});

	for (const key of ["openrouterKey", "openaiKey", "anthropicKey"] as const)
		it(`is true with a stored ${key}`, () => {
			expect(businessDraftPossible({ ...NO_AI, [key]: true })).toBe(true);
		});

	it("is true with a ChatGPT sign-in", () => {
		expect(businessDraftPossible({ ...NO_AI, chatgpt: true })).toBe(true);
	});
});

describe("readingBusinessDraft", () => {
	const waiting = { pending: false, description: "", elapsedMs: 0 };

	it("never shows the spinner when no draft can come", () => {
		expect(readingBusinessDraft({ ...waiting, possible: false })).toBe(false);
		expect(
			readingBusinessDraft({ ...waiting, pending: true, possible: false }),
		).toBe(false);
	});

	it("shows the spinner while a draft can still come", () => {
		expect(readingBusinessDraft({ ...waiting, possible: true })).toBe(true);
	});

	it("shows the spinner while the rules load", () => {
		expect(
			readingBusinessDraft({
				...waiting,
				pending: true,
				description: "x",
				possible: true,
			}),
		).toBe(true);
	});

	it("stops once the draft is there", () => {
		expect(
			readingBusinessDraft({
				...waiting,
				description: "We build web apps.",
				possible: true,
			}),
		).toBe(false);
	});

	it("gives up after the wait", () => {
		expect(
			readingBusinessDraft({
				...waiting,
				elapsedMs: BUSINESS_STEP.waitMs,
				possible: true,
			}),
		).toBe(false);
	});
});
