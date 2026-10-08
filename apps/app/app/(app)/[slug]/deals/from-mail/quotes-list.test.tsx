import { describe, expect, it, mock } from "bun:test";

const nuqs = { ...(await import("nuqs")) };
mock.module("nuqs", () => ({
	...nuqs,
	useQueryState: (_key: string, parser?: { defaultValue?: unknown }) => [
		parser?.defaultValue ?? null,
		() => {},
	],
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { QuotesList, quotesPage } = await import("./quotes-list");

const query = {
	search: "",
	page: 1,
	pageSize: 25,
	sort: "",
	dir: "asc" as const,
	tab: "all",
	filters: {},
	setPage: async () => {},
	setPageSize: () => {},
	setSort: () => {},
	setDir: () => {},
	setTab: () => {},
	setFilter: () => {},
	toggleSort: () => {},
	reset: () => {},
};

function quote(n: number) {
	return {
		threadId: `thread-${n}`,
		subject: `Paletten ${n}`,
		summary: "",
		lastMessageAt: "2026-09-19T09:40:00.000Z",
		quantityPallets: 620,
		products: [],
		topics: [],
		company: { id: `company-${n}`, name: `Feinkost Sued ${n}` },
		contact: {
			id: `contact-${n}`,
			firstName: "Martin",
			lastName: "Berg",
			email: "preview@example.com",
			imageUrl: null,
		},
	};
}

function render(busy: string | null = null) {
	return renderToStaticMarkup(
		<QuotesList
			query={query}
			rows={[quote(1)]}
			unit="pallets"
			busy={busy}
			onCreate={() => {}}
			onDismiss={() => {}}
			onOpen={() => {}}
		/>,
	);
}

function cells(markup: string): string[] {
	return markup.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
}

describe("Quotes in your mail", () => {
	const markup = render();
	const [company, ...rest] = cells(markup);

	it("clips instead of scrolling sideways", () => {
		expect(markup).toContain("overflow-x-clip");
		expect(markup).not.toContain("overflow-x-auto");
	});

	it("keeps the company on one line with no second line under it", () => {
		expect(company).toContain("Feinkost Sued 1");
		expect(company).not.toContain("Martin Berg");
		expect(company).not.toContain("flex-col");
	});

	it("shows the contact in its own labelled column", () => {
		const contact = rest.find((cell) => cell.includes('data-label="Contact"'));
		expect(contact).toContain("Martin Berg");
	});

	it("labels every other cell for the phone card", () => {
		for (const cell of rest) expect(cell).toMatch(/data-label="[^"]+"/);
	});

	it("keeps the create and put aside actions in the actions column", () => {
		const actions = rest.find((cell) => cell.includes('data-label="Actions"'));
		expect(actions).toContain("Create deal");
		expect(actions).toContain('aria-label="Put aside"');
	});

	it("shows a spinner instead of the actions while a row is busy", () => {
		const busy = cells(render("thread-1")).find((cell) =>
			cell.includes('data-label="Actions"'),
		);
		expect(busy).not.toContain("Create deal");
	});
});

describe("quotesPage", () => {
	const rows = Array.from({ length: 30 }, (_, index) => index);

	it("returns the rows of the page in the URL", () => {
		expect(quotesPage(rows, 1, 25)).toEqual(rows.slice(0, 25));
		expect(quotesPage(rows, 2, 25)).toEqual(rows.slice(25));
	});

	it("returns no rows past the last page", () => {
		expect(quotesPage(rows, 3, 25)).toEqual([]);
	});
});
