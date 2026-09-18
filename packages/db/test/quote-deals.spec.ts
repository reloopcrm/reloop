import { describe, expect, it } from "bun:test";
import type { QuantityRule, ThreadSignal } from "../src/contact-worth";
import {
	isQuoteOutcome,
	QUOTE_DEAL_STAGE,
	quoteWorthDeal,
} from "../src/quote-deals";

const rule: QuantityRule = {
	minPallets: 20,
	minBoxes: 5,
	boxProducts: ["Gitterbox"],
};

function signal(over: Partial<ThreadSignal> = {}): ThreadSignal {
	return {
		relevant: true,
		outcome: "QUOTED",
		quantityPallets: 30,
		unansweredByUs: false,
		products: ["Europalette"],
		topics: [],
		...over,
	};
}

describe("quoteWorthDeal", () => {
	it("takes a quote big enough to be worth a deal", () => {
		expect(quoteWorthDeal(signal(), rule)).toBe(true);
		expect(quoteWorthDeal(signal({ outcome: "OPEN_OFFER_OURS" }), rule)).toBe(
			true,
		);
	});

	it("leaves out every other outcome", () => {
		for (const outcome of [
			"DEAL_DONE",
			"OPEN_INQUIRY_THEIRS",
			"DECLINED",
			"OTHER",
		]) {
			expect(quoteWorthDeal(signal({ outcome }), rule)).toBe(false);
		}
	});

	it("leaves out a thread the agent calls irrelevant", () => {
		expect(quoteWorthDeal(signal({ relevant: false }), rule)).toBe(false);
	});

	it("leaves out a quote below the quantity rule", () => {
		expect(quoteWorthDeal(signal({ quantityPallets: 19 }), rule)).toBe(false);
	});

	it("leaves out a quote with no quantity at all", () => {
		expect(quoteWorthDeal(signal({ quantityPallets: null }), rule)).toBe(false);
	});

	it("uses the box minimum for a box product", () => {
		const boxes = signal({ quantityPallets: 6, products: ["Gitterbox"] });

		expect(quoteWorthDeal(boxes, rule)).toBe(true);
		expect(quoteWorthDeal({ ...boxes, quantityPallets: 4 }, rule)).toBe(false);
	});
});

describe("the quote stage", () => {
	it("is the stage that means the offer went out", () => {
		expect(QUOTE_DEAL_STAGE).toBe("CONTRACT_SENT");
	});

	it("knows which outcomes are a quote", () => {
		expect(isQuoteOutcome("QUOTED")).toBe(true);
		expect(isQuoteOutcome("OPEN_OFFER_OURS")).toBe(true);
		expect(isQuoteOutcome("DEAL_DONE")).toBe(false);
	});
});
