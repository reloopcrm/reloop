import { describe, expect, it, mock } from "bun:test";

const stack = {
	...(await import("@/components/crm/record-sheet/record-stack")),
};
const prefetch = {
	...(await import("@/components/crm/record-sheet/record-prefetch")),
};
mock.module("@/components/crm/record-sheet/record-stack", () => ({
	...stack,
	useOpenRecord: () => () => {},
}));
mock.module("@/components/crm/record-sheet/record-prefetch", () => ({
	...prefetch,
	usePrefetchRecord: () => () => {},
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { DealListResultTable } = await import("./deal-list-result");

const result = {
	asOf: "2026-09-19T09:40:00.000Z",
	criteria: {
		status: "open",
		inactiveForDays: null,
		companyId: null,
		ownerId: null,
	},
	deals: [
		{
			id: "deal-1",
			name: "Europaletten Herbst",
			stage: "Proposal",
			amount: 1200,
			currency: "EUR",
			company: {
				id: "company-1",
				name: "Feinkost Sued",
				domain: null,
				iconUrl: null,
				iconDarkUrl: null,
				iconTone: null,
				logoUrl: null,
			},
			owner: null,
			daysSinceLastActivity: 3,
			neverActive: false,
			expectedCloseDate: null,
		},
	],
	hasMore: false,
};

describe("DealListResultTable", () => {
	const markup = renderToStaticMarkup(<DealListResultTable result={result} />);
	const table = markup.match(/<table[^>]*>/)?.[0] ?? "";

	it("fits the chat column instead of forcing a minimum width", () => {
		expect(table).toContain("table-fixed");
		expect(table).not.toMatch(/["\s]min-w-/);
	});

	it("still lists the deal", () => {
		expect(markup).toContain("Europaletten Herbst");
		expect(markup).toContain("Feinkost Sued");
	});
});
