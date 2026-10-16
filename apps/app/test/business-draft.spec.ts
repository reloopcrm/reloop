import { describe, expect, it } from "bun:test";
import { BUSINESS_DRAFT } from "@crm/db/win-back-rules";
import {
	BUSINESS_STEP,
	businessDraftPossible,
	readingBusinessDraft,
} from "../app/(landing)/onboarding/business/business-config";
import {
	answeredWithin,
	businessDraftExpected,
} from "../app/(landing)/onboarding/business/business-draft";

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

describe("businessDraftExpected", () => {
	const MODEL = {
		fixed: false,
		openrouterKey: true,
		openaiKey: false,
		anthropicKey: false,
	};
	const NO_MODEL = { ...MODEL, openrouterKey: false };
	const NO_MATERIAL = { threads: 0, website: false };
	const signedOut = { chosen: false, admin: true, signedIn: async () => false };
	const hanging = {
		...signedOut,
		signedIn: () => new Promise<boolean>(() => {}),
	};

	it("waits for a draft with a model and a website", async () => {
		expect(
			await businessDraftExpected({
				model: MODEL,
				material: { ...NO_MATERIAL, website: true },
				chatgpt: signedOut,
			}),
		).toBe(true);
	});

	it("waits for a draft with a model and enough mail", async () => {
		expect(
			await businessDraftExpected({
				model: MODEL,
				material: { ...NO_MATERIAL, threads: BUSINESS_DRAFT.minThreads },
				chatgpt: signedOut,
			}),
		).toBe(true);
	});

	it("shows the form at once with a model but no website and too little mail", async () => {
		expect(
			await businessDraftExpected({
				model: MODEL,
				material: { ...NO_MATERIAL, threads: BUSINESS_DRAFT.minThreads - 1 },
				chatgpt: signedOut,
			}),
		).toBe(false);
	});

	it("shows the form at once without a model", async () => {
		expect(
			await businessDraftExpected({
				model: NO_MODEL,
				material: { threads: BUSINESS_DRAFT.minThreads, website: true },
				chatgpt: signedOut,
			}),
		).toBe(false);
	});

	it("waits for a draft with a ChatGPT sign-in and a website", async () => {
		expect(
			await businessDraftExpected({
				model: NO_MODEL,
				material: { ...NO_MATERIAL, website: true },
				chatgpt: { ...signedOut, signedIn: async () => true },
			}),
		).toBe(true);
	});

	it("trusts the chosen ChatGPT provider for a rep, who cannot read the login", async () => {
		let asked = false;
		const expected = await businessDraftExpected({
			model: NO_MODEL,
			material: { ...NO_MATERIAL, website: true },
			chatgpt: {
				chosen: true,
				admin: false,
				signedIn: async () => {
					asked = true;
					return false;
				},
			},
		});

		expect(expected).toBe(true);
		expect(asked).toBe(false);
	});

	it("shows a rep the form at once while ChatGPT is not the chosen provider", async () => {
		expect(
			await businessDraftExpected({
				model: NO_MODEL,
				material: { ...NO_MATERIAL, website: true },
				chatgpt: { ...signedOut, admin: false, signedIn: async () => true },
			}),
		).toBe(false);
	});

	it("never asks the agent for the ChatGPT login when no draft can come", async () => {
		let asked = false;
		await businessDraftExpected({
			model: NO_MODEL,
			material: NO_MATERIAL,
			chatgpt: {
				...signedOut,
				signedIn: async () => {
					asked = true;
					return true;
				},
			},
		});

		expect(asked).toBe(false);
	});

	it("gives up on a hanging ChatGPT login check after the bound", async () => {
		const started = Date.now();
		const expected = await businessDraftExpected({
			model: NO_MODEL,
			material: { ...NO_MATERIAL, website: true },
			chatgpt: hanging,
		});

		expect(expected).toBe(false);
		expect(Date.now() - started).toBeLessThan(
			BUSINESS_STEP.loginCheckMs + 1_000,
		);
	});
});

describe("answeredWithin", () => {
	it("passes the answer through when it comes in time", async () => {
		expect(await answeredWithin(async () => true, 50)).toBe(true);
	});

	it("is false when the check never answers", async () => {
		expect(await answeredWithin(() => new Promise(() => {}), 5)).toBe(false);
	});
});
