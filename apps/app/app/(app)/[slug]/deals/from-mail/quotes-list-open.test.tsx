import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/acme/deals/from-mail" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const nuqs = { ...(await import("nuqs")) };
mock.module("nuqs", () => ({
	...nuqs,
	useQueryState: (_key: string, parser?: { defaultValue?: unknown }) => [
		parser?.defaultValue ?? null,
		() => {},
	],
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { QuotesList } = await import("./quotes-list");

afterAll(() => {
	GlobalRegistrator.unregister();
});

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

const row = {
	threadId: "thread-1",
	subject: "Paletten 1",
	summary: "",
	lastMessageAt: "2026-09-19T09:40:00.000Z",
	quantityPallets: 620,
	products: [],
	topics: [],
	company: { id: "company-1", name: "Feinkost Sued 1" },
	contact: {
		id: "contact-1",
		firstName: "Martin",
		lastName: "Berg",
		email: "preview@example.com",
		imageUrl: null,
	},
};

async function mount() {
	const opened: string[] = [];
	const created: string[] = [];
	const dismissed: string[] = [];
	const host = document.createElement("div");
	document.body.append(host);
	await act(async () => {
		createRoot(host).render(
			createElement(QuotesList, {
				query,
				rows: [row],
				unit: "pallets",
				busy: null,
				onCreate: (quote) => created.push(quote.threadId),
				onDismiss: (quote) => dismissed.push(quote.threadId),
				onOpen: (quote) => opened.push(quote.company.id),
			}),
		);
	});
	return { host, opened, created, dismissed };
}

function click(element: Element) {
	return act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

describe("Quotes in your mail row", () => {
	it("opens the company record when the row is clicked", async () => {
		const { host, opened } = await mount();
		const cell = host.querySelector("tbody td");
		if (!cell) throw new Error("no cell");
		await click(cell);
		expect(opened).toEqual(["company-1"]);
	});

	it("opens the company record when Enter is pressed on the row", async () => {
		const { host, opened } = await mount();
		const tr = host.querySelector("tbody tr");
		if (!tr) throw new Error("no row");
		await act(async () => {
			tr.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
		});
		expect(opened).toEqual(["company-1"]);
	});

	it("does not open the record when Create deal is clicked", async () => {
		const { host, opened, created } = await mount();
		const button = Array.from(host.querySelectorAll("button")).find(
			(item) => item.textContent === "Create deal",
		);
		if (!button) throw new Error("no button");
		await click(button);
		expect(created).toEqual(["thread-1"]);
		expect(opened).toEqual([]);
	});

	it("does not open the record when Put aside is clicked", async () => {
		const { host, opened, dismissed } = await mount();
		const button = host.querySelector('button[aria-label="Put aside"]');
		if (!button) throw new Error("no button");
		await click(button);
		expect(dismissed).toEqual(["thread-1"]);
		expect(opened).toEqual([]);
	});
});
