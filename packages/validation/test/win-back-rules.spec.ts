import { describe, expect, it } from "bun:test";
import {
	DEFAULT_WIN_BACK_RULES,
	parseWinBackRules,
} from "../src/win-back-rules";

const tuned = {
	v: 1,
	include: {
		neverReplied: false,
		requireCompany: false,
		requireDeal: false,
		requireMeeting: false,
		requireTopic: true,
		minEmails: 1,
		minFromThem: 1,
	},
	business: {
		description: "Wir kaufen und verkaufen Europaletten.",
		products: ["Europalette", "EPAL", "Palette", "Gitterbox"],
		minPallets: 495,
		minBoxes: 15,
		boxProducts: ["Gitterbox", "Gitterboxen", "Lagerbox"],
	},
	points: {
		waitingOnUs: 10,
		perEmailFromThem: 3,
		perEmailFromUs: 0,
		perMeeting: 0,
		openDeal: 30,
		wonDeal: 70,
		hasCompany: 10,
		titleKeyword: 50,
		pastBusiness: 100,
		openInquiry: 0,
		bigQuantity: 0,
		productMatch: 0,
		goodFeedback: 100,
	},
	titleKeywords: ["Inhaber"],
	excludedDomains: ["gmail.com"],
};

describe("parseWinBackRules keeps rules that were saved before the side tier", () => {
	it("keeps every tuned value instead of falling back to the defaults", () => {
		const parsed = parseWinBackRules(tuned);

		expect(parsed.points.wonDeal).toBe(70);
		expect(parsed.points.productMatch).toBe(0);
		expect(parsed.business.minPallets).toBe(495);
		expect(parsed.titleKeywords).toEqual(["Inhaber"]);
		expect(parsed).not.toEqual(DEFAULT_WIN_BACK_RULES);
	});

	it("fills the side tier of an old row exactly as before", () => {
		const parsed = parseWinBackRules(tuned);

		expect(parsed.business.sideProducts).toEqual([
			"CP-Palette",
			"CP1",
			"CP2",
			"CP3",
			"Einwegpalette",
		]);
		expect(parsed.points.sideProductMatch).toBe(
			DEFAULT_WIN_BACK_RULES.points.sideProductMatch,
		);
	});

	it("keeps a side tier that is already saved", () => {
		const parsed = parseWinBackRules({
			...tuned,
			business: { ...tuned.business, sideProducts: ["CP3"] },
			points: { ...tuned.points, sideProductMatch: 2 },
		});

		expect(parsed.business.sideProducts).toEqual(["CP3"]);
		expect(parsed.points.sideProductMatch).toBe(2);
	});

	it("scores the side tier below the main tier in the defaults", () => {
		expect(DEFAULT_WIN_BACK_RULES.points.sideProductMatch).toBeLessThan(
			DEFAULT_WIN_BACK_RULES.points.productMatch,
		);
	});
});

describe("stored rules and the neutral defaults", () => {
	it("keeps a stored business exactly, with only the unit label added", () => {
		const stored = {
			...tuned,
			business: { ...tuned.business, sideProducts: ["CP3"] },
			points: { ...tuned.points, sideProductMatch: 2 },
		};

		const parsed = parseWinBackRules(stored);

		expect(parsed.business).toEqual({
			...stored.business,
			unit: "units",
			learnedFromMail: false,
		});
		expect(parsed.points).toEqual(stored.points);
		expect(parsed.include).toEqual(stored.include);
		expect(parsed.titleKeywords).toEqual(stored.titleKeywords);
	});

	it("keeps a stored unit label", () => {
		const parsed = parseWinBackRules({
			...tuned,
			business: { ...tuned.business, unit: "Paletten" },
		});

		expect(parsed.business.unit).toBe("Paletten");
	});

	it("uses the neutral defaults only when nothing is stored", () => {
		expect(parseWinBackRules(null)).toEqual(DEFAULT_WIN_BACK_RULES);
		expect(DEFAULT_WIN_BACK_RULES.business.description).toBe("");
	});
});
