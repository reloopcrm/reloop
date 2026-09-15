import { describe, expect, it } from "bun:test";
import {
	CONTACT_POTENTIAL,
	CONTACT_STANDING,
	standingOf,
} from "../src/contact-standing";
import type { ContactSignals } from "../src/contact-worth";

const MIN = { minPallets: 350, minBoxes: 15, boxProducts: ["Gitterbox"] };

const NOTHING: ContactSignals = {
	hasDeal: false,
	verdict: null,
	insights: [],
	unreadThreads: 0,
};

const thread = (over: Partial<ContactSignals["insights"][number]> = {}) => ({
	relevant: true,
	outcome: "NONE",
	quantityPallets: null,
	unansweredByUs: false,
	...over,
});

const inquiry = (over: Partial<ContactSignals["insights"][number]> = {}) =>
	thread({ outcome: "OPEN_INQUIRY_THEIRS", ...over });

const standing = (over: Partial<ContactSignals>) =>
	standingOf({ ...NOTHING, ...over }, MIN).standing;

const potential = (over: Partial<ContactSignals>) =>
	standingOf({ ...NOTHING, ...over }, MIN).potential;

describe("what a contact is", () => {
	it("calls a deal in the CRM a customer", () => {
		expect(standing({ hasDeal: true })).toBe(CONTACT_STANDING.customer);
	});

	it("calls a closed deal in the conversation a customer", () => {
		expect(standing({ insights: [thread({ outcome: "DEAL_DONE" })] })).toBe(
			CONTACT_STANDING.customer,
		);
	});

	it("calls a big enough quantity interested", () => {
		expect(standing({ insights: [thread({ quantityPallets: 350 })] })).toBe(
			CONTACT_STANDING.interested,
		);
	});

	it("calls an inquiry from them interested", () => {
		expect(standing({ insights: [inquiry()] })).toBe(
			CONTACT_STANDING.interested,
		);
	});

	it("calls a message we never answered interested", () => {
		expect(standing({ insights: [thread({ unansweredByUs: true })] })).toBe(
			CONTACT_STANDING.interested,
		);
	});

	it("calls a good verdict interested", () => {
		expect(standing({ verdict: "good" })).toBe(CONTACT_STANDING.interested);
	});

	it("watches everybody else", () => {
		expect(standing({})).toBe(CONTACT_STANDING.watch);
		expect(standing({ insights: [thread()] })).toBe(CONTACT_STANDING.watch);
		expect(standing({ insights: [thread({ quantityPallets: 120 })] })).toBe(
			CONTACT_STANDING.watch,
		);
		expect(
			standing({ insights: [thread({ outcome: "OPEN_OFFER_OURS" })] }),
		).toBe(CONTACT_STANDING.watch);
		expect(standing({ verdict: "later" })).toBe(CONTACT_STANDING.watch);
		expect(standing({ unreadThreads: 3 })).toBe(CONTACT_STANDING.watch);
	});

	it("ignores a conversation the agent judged off topic", () => {
		expect(
			standing({
				insights: [thread({ relevant: false, quantityPallets: 900 })],
			}),
		).toBe(CONTACT_STANDING.watch);
	});

	it("drops an inquiry that names a quantity below the minimum", () => {
		expect(standing({ insights: [inquiry({ quantityPallets: 120 })] })).toBe(
			CONTACT_STANDING.watch,
		);
	});

	it("keeps an inquiry that names no quantity at all", () => {
		expect(standing({ insights: [inquiry()] })).toBe(
			CONTACT_STANDING.interested,
		);
	});

	it("keeps a bad verdict a customer, because the deal happened", () => {
		expect(standing({ hasDeal: true, verdict: "bad" })).toBe(
			CONTACT_STANDING.customer,
		);
	});
});

describe("how much they are worth", () => {
	it("rates past business high", () => {
		expect(potential({ hasDeal: true })).toBe(CONTACT_POTENTIAL.high);
		expect(potential({ insights: [thread({ outcome: "DEAL_DONE" })] })).toBe(
			CONTACT_POTENTIAL.high,
		);
	});

	it("rates three times the minimum high", () => {
		expect(potential({ insights: [thread({ quantityPallets: 1050 })] })).toBe(
			CONTACT_POTENTIAL.high,
		);
	});

	it("rates three inquiries high", () => {
		expect(potential({ insights: [inquiry(), inquiry(), inquiry()] })).toBe(
			CONTACT_POTENTIAL.high,
		);
	});

	it("rates the minimum medium", () => {
		expect(potential({ insights: [thread({ quantityPallets: 350 })] })).toBe(
			CONTACT_POTENTIAL.medium,
		);
		expect(potential({ insights: [thread({ quantityPallets: 1049 })] })).toBe(
			CONTACT_POTENTIAL.medium,
		);
	});

	it("rates two inquiries medium", () => {
		expect(potential({ insights: [inquiry(), inquiry()] })).toBe(
			CONTACT_POTENTIAL.medium,
		);
	});

	it("rates a good verdict medium", () => {
		expect(potential({ verdict: "good" })).toBe(CONTACT_POTENTIAL.medium);
	});

	it("rates everybody else low", () => {
		expect(potential({})).toBe(CONTACT_POTENTIAL.low);
		expect(potential({ insights: [thread({ quantityPallets: 120 })] })).toBe(
			CONTACT_POTENTIAL.low,
		);
		expect(potential({ verdict: "later", unreadThreads: 2 })).toBe(
			CONTACT_POTENTIAL.low,
		);
	});
});

describe("boxes count differently", () => {
	it("takes fifteen mesh boxes but not fifteen pallets", () => {
		expect(
			standing({
				insights: [thread({ quantityPallets: 15, products: ["Gitterboxen"] })],
			}),
		).toBe(CONTACT_STANDING.interested);

		expect(
			standing({
				insights: [thread({ quantityPallets: 15, products: ["Europaletten"] })],
			}),
		).toBe(CONTACT_STANDING.watch);
	});

	it("rates forty five mesh boxes high", () => {
		expect(
			potential({
				insights: [thread({ quantityPallets: 45, products: ["Gitterboxen"] })],
			}),
		).toBe(CONTACT_POTENTIAL.high);

		expect(
			potential({
				insights: [thread({ quantityPallets: 44, products: ["Gitterboxen"] })],
			}),
		).toBe(CONTACT_POTENTIAL.medium);
	});
});

describe("the quantity the memory remembers", () => {
	it("uses the remembered quantity when no conversation names one", () => {
		expect(standingOf({ ...NOTHING, knownPallets: 350 }, MIN)).toEqual({
			standing: CONTACT_STANDING.interested,
			potential: CONTACT_POTENTIAL.medium,
		});

		expect(standingOf({ ...NOTHING, knownPallets: 1050 }, MIN)).toEqual({
			standing: CONTACT_STANDING.interested,
			potential: CONTACT_POTENTIAL.high,
		});
	});

	it("measures the remembered quantity in pallets, never in boxes", () => {
		expect(
			standingOf(
				{ ...NOTHING, knownPallets: 20, products: ["Gitterboxen"] },
				MIN,
			),
		).toEqual({
			standing: CONTACT_STANDING.watch,
			potential: CONTACT_POTENTIAL.low,
		});
	});

	it("prefers the conversation over the memory", () => {
		expect(
			standing({
				knownPallets: 5_000,
				insights: [thread({ quantityPallets: 10 })],
			}),
		).toBe(CONTACT_STANDING.watch);
	});
});

describe("the topic still has to fit", () => {
	it("drops an inquiry that never mentions your products", () => {
		expect(
			standing({
				products: ["Europalette", "Gitterbox"],
				insights: [inquiry({ topics: ["Werbung"] })],
			}),
		).toBe(CONTACT_STANDING.watch);
	});

	it("keeps an inquiry about your products", () => {
		expect(
			standing({
				products: ["Europalette", "Gitterbox"],
				insights: [inquiry({ products: ["Europaletten"] })],
			}),
		).toBe(CONTACT_STANDING.interested);
	});

	it("counts every inquiry while no products are set", () => {
		expect(
			potential({ insights: [inquiry(), inquiry(), inquiry()], products: [] }),
		).toBe(CONTACT_POTENTIAL.high);
	});
});
