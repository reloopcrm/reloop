import { describe, expect, it } from "bun:test";
import {
	CONTACT_WORTH,
	type ContactSignals,
	contactWorth,
	threadWorthAdopting,
} from "../src/contact-worth";

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

describe("who belongs in the CRM", () => {
	it("keeps a contact with a closed deal in the conversation", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ outcome: "DEAL_DONE" })] },
				MIN,
			),
		).toBe(CONTACT_WORTH.business);
	});

	it("keeps a quantity at or above one truck load", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ quantityPallets: 350 })] },
				MIN,
			),
		).toBe(CONTACT_WORTH.quantity);
	});

	it("drops a quantity below one truck load", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ quantityPallets: 120 })] },
				MIN,
			),
		).toBeNull();
	});

	it("keeps somebody who asked us something", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ outcome: "OPEN_INQUIRY_THEIRS" })] },
				MIN,
			),
		).toBe(CONTACT_WORTH.asked);
	});

	it("keeps somebody we never answered", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ unansweredByUs: true })] },
				MIN,
			),
		).toBe(CONTACT_WORTH.asked);
	});

	it("drops our own offer that nobody answered", () => {
		expect(
			contactWorth(
				{ ...NOTHING, insights: [thread({ outcome: "OPEN_OFFER_OURS" })] },
				MIN,
			),
		).toBeNull();
	});

	it("drops a conversation that led nowhere", () => {
		expect(contactWorth({ ...NOTHING, insights: [thread()] }, MIN)).toBeNull();
	});

	it("waits while a conversation is still unread", () => {
		expect(contactWorth({ ...NOTHING, unreadThreads: 1 }, MIN)).toBe(
			CONTACT_WORTH.unread,
		);
	});

	it("follows your own verdict in both directions", () => {
		expect(
			contactWorth({ ...NOTHING, verdict: "good", insights: [thread()] }, MIN),
		).toBe(CONTACT_WORTH.verdict);

		expect(
			contactWorth(
				{
					...NOTHING,
					verdict: "bad",
					insights: [thread({ outcome: "DEAL_DONE" })],
				},
				MIN,
			),
		).toBeNull();
	});

	it("ignores a conversation the agent judged off topic", () => {
		expect(
			contactWorth(
				{
					...NOTHING,
					insights: [thread({ relevant: false, quantityPallets: 900 })],
				},
				MIN,
			),
		).toBeNull();
	});
});

describe("the topic still has to fit", () => {
	it("drops an inquiry that never mentions your products", () => {
		expect(
			contactWorth(
				{
					...NOTHING,
					products: ["Europalette", "Gitterbox"],
					insights: [
						thread({ outcome: "OPEN_INQUIRY_THEIRS", topics: ["Werbung"] }),
					],
				},
				MIN,
			),
		).toBeNull();
	});

	it("keeps an inquiry about your products", () => {
		expect(
			contactWorth(
				{
					...NOTHING,
					products: ["Europalette", "Gitterbox"],
					insights: [
						thread({
							outcome: "OPEN_INQUIRY_THEIRS",
							products: ["Europaletten"],
						}),
					],
				},
				MIN,
			),
		).toBe(CONTACT_WORTH.asked);
	});
});

describe("which conversation earns a contact", () => {
	it("adopts a closed deal and a real quantity", () => {
		expect(threadWorthAdopting(thread({ outcome: "DEAL_DONE" }), MIN)).toBe(
			true,
		);
		expect(threadWorthAdopting(thread({ quantityPallets: 500 }), MIN)).toBe(
			true,
		);
	});

	it("refuses a small quantity, our unanswered offer and an unread thread", () => {
		expect(threadWorthAdopting(thread({ quantityPallets: 40 }), MIN)).toBe(
			false,
		);
		expect(
			threadWorthAdopting(thread({ outcome: "OPEN_OFFER_OURS" }), MIN),
		).toBe(false);
		expect(threadWorthAdopting(null, MIN)).toBe(false);
	});
});

describe("boxes count differently", () => {
	it("keeps fifteen mesh boxes but not fifteen pallets", () => {
		expect(
			contactWorth(
				{
					...NOTHING,
					insights: [
						thread({ quantityPallets: 15, products: ["Gitterboxen"] }),
					],
				},
				MIN,
			),
		).toBe(CONTACT_WORTH.quantity);

		expect(
			contactWorth(
				{
					...NOTHING,
					insights: [
						thread({ quantityPallets: 15, products: ["Europaletten"] }),
					],
				},
				MIN,
			),
		).toBeNull();
	});

	it("adopts a mesh box conversation from fifteen upwards", () => {
		expect(
			threadWorthAdopting(
				thread({ quantityPallets: 20, topics: ["Gitterbox Ankauf"] }),
				MIN,
			),
		).toBe(true);
		expect(
			threadWorthAdopting(
				thread({ quantityPallets: 8, topics: ["Gitterbox Ankauf"] }),
				MIN,
			),
		).toBe(false);
	});
});
