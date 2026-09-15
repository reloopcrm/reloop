import { describe, expect, it } from "bun:test";
import {
	factTitle,
	shortFact,
	type WinBackFacts,
} from "../app/(app)/[slug]/win-back/win-back-verdict";

const t = (text: string, vars?: Record<string, string | number>) =>
	text.replace(/\{(\w+)\}/g, (match, key: string) =>
		vars && key in vars ? String(vars[key]) : match,
	);

function source(over: Partial<WinBackFacts> = {}): WinBackFacts {
	return {
		waitingOnUs: false,
		memory: {
			summary: null,
			didBusiness: 0,
			openInquiries: 0,
			maxPallets: null,
			products: [],
			threadsRead: 1,
		},
		...over,
	};
}

function fact(
	over: Partial<WinBackFacts["memory"]>,
	rest: Partial<WinBackFacts> = {},
) {
	return shortFact(
		source({ ...rest, memory: { ...source().memory, ...over } }),
		t,
		"en",
	);
}

describe("the one fact per row", () => {
	it("names deals first", () => {
		expect(fact({ didBusiness: 1, openInquiries: 4 })).toBe("1 deal");
		expect(fact({ didBusiness: 3 })).toBe("3 deals");
	});

	it("names the quantity next", () => {
		expect(fact({ maxPallets: 660, openInquiries: 2 })).toBe("660 units asked");
	});

	it("names open inquiries next", () => {
		expect(fact({ openInquiries: 2 })).toBe("2 open inquiries");
		expect(fact({ openInquiries: 1 })).toBe("1 open inquiry");
	});

	it("names the wait when no number is there", () => {
		expect(fact({}, { waitingOnUs: true })).toBe("Waiting on your reply");
	});

	it("falls back to the product, then to the reading state", () => {
		expect(fact({ products: ["Europalette"] })).toBe("Europalette");
		expect(fact({ threadsRead: 0 })).toBe("Not read yet");
		expect(fact({})).toBe("Nothing about the business yet");
	});

	it("stays short enough for one line", () => {
		expect(fact({ maxPallets: 12_000 }).length).toBeLessThanOrEqual(45);
	});
});

describe("the tooltip behind the fact", () => {
	it("puts every fact on the first line", () => {
		const line = factTitle(
			source({
				waitingOnUs: true,
				memory: {
					summary: null,
					didBusiness: 2,
					openInquiries: 1,
					maxPallets: 800,
					products: ["Europalette"],
					threadsRead: 4,
				},
			}),
			t,
			"en",
		);

		expect(line).toBe(
			"2 deals done · 1 open inquiry · up to 800 units · Waiting on your reply · Europalette",
		);
	});

	it("adds the agent summary underneath", () => {
		const line = factTitle(
			source({ memory: { ...source().memory, summary: "Wants pallets." } }),
			t,
			"en",
		);

		expect(line.split("\n")[1]).toBe("Wants pallets.");
	});
});
