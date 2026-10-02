import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	fitColumnWidths,
	pageAfterEnd,
	pageWindow,
	TABLE,
} from "../lib/table-config";

const parser = { withDefault: (value: unknown) => value };

mock.module("nuqs", () => ({
	parseAsArrayOf: () => parser,
	parseAsString: parser,
	useQueryState: (_key: string, fallback: unknown) => [fallback, () => {}],
}));

const { DataTable } = await import("./data-table");

const query = {
	search: "",
	page: 1,
	pageSize: 25,
	sort: "name",
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

const noSelection = {
	ids: [],
	count: 0,
	has: () => false,
	toggle: () => {},
	toggleAll: () => {},
	clear: () => {},
	allSelected: false,
	someSelected: false,
};

function cells(markup: string): string[] {
	return markup.match(/<td[^>]*>/g) ?? [];
}

function heads(markup: string): string[] {
	return markup.match(/<th(?:\s[^>]*)?>/g) ?? [];
}

describe("DataTable", () => {
	const markup = renderToStaticMarkup(
		<DataTable
			query={query}
			columns={[
				{ id: "name", header: "Name", cell: (row) => row.name },
				{ id: "city", header: "City", size: 160, cell: () => "Genoa" },
				{
					id: "actions",
					header: "Actions",
					control: true,
					cell: () => <button type="button">Edit</button>,
				},
			]}
			rows={[{ id: "1", name: "Ada" }]}
			total={1}
			getRowId={(row) => row.id}
			onRowClick={() => {}}
		/>,
	);
	const [text, second, control] = cells(markup);
	const [, , controlHead] = heads(markup);

	it("keeps every cell on one line and cuts it with an ellipsis", () => {
		expect(text).toContain("truncate");
		expect(text).toContain("max-w-0");
		expect(second).toContain("truncate");
	});

	it("fixes the column widths so a long value never widens the table", () => {
		expect(markup).toContain("table-fixed");
		expect(markup).toContain("width:160px");
		expect(markup).toContain(`width:${TABLE.column.controlPx}px`);
	});

	it("never truncates a control cell or its header", () => {
		expect(control).not.toContain("truncate");
		expect(controlHead).not.toContain("truncate");
	});

	it("clips instead of scrolling sideways", () => {
		expect(markup).toContain("overflow-x-clip");
		expect(markup).not.toContain("overflow-x-auto");
	});

	it("labels each secondary cell for the phone card", () => {
		expect(second).toContain('data-label="City"');
	});

	it("lets the keyboard open a clickable row", () => {
		expect(markup).toMatch(/<tr[^>]*tabindex="0"/);
	});

	it("shows the selection bar only while something is selected", () => {
		const idle = renderToStaticMarkup(
			<DataTable
				query={query}
				columns={[{ id: "name", header: "Name", cell: (row) => row.name }]}
				rows={[{ id: "1", name: "Ada" }]}
				total={1}
				getRowId={(row) => row.id}
				selection={{ state: noSelection, actions: null }}
			/>,
		);
		expect(idle).not.toContain('data-slot="selection-bar"');

		const picked = renderToStaticMarkup(
			<DataTable
				query={query}
				columns={[{ id: "name", header: "Name", cell: (row) => row.name }]}
				rows={[{ id: "1", name: "Ada" }]}
				total={1}
				getRowId={(row) => row.id}
				selection={{
					state: { ...noSelection, ids: ["1"], count: 1, has: () => true },
					actions: <button type="button">Archive</button>,
				}}
			/>,
		);
		expect(picked).toContain('data-slot="selection-bar"');
		expect(picked).toContain("Archive");
		expect(picked).toContain("Clear selection");
	});

	it("lets the select-all checkbox header overflow its cell", () => {
		const selectionMarkup = renderToStaticMarkup(
			<DataTable
				query={query}
				columns={[{ id: "name", header: "Name", cell: (row) => row.name }]}
				rows={[{ id: "1", name: "Ada" }]}
				total={1}
				getRowId={(row) => row.id}
				selection={{ state: noSelection, actions: null }}
			/>,
		);
		const [checkboxHead] = heads(selectionMarkup);
		expect(checkboxHead).toContain("overflow-visible");
	});

	it("offers to reset the filters when they match nothing", () => {
		const emptyMarkup = renderToStaticMarkup(
			<DataTable
				query={{ ...query, search: "nobody" }}
				columns={[{ id: "name", header: "Name", cell: () => "" }]}
				rows={[]}
				total={0}
				getRowId={() => ""}
			/>,
		);
		expect(emptyMarkup).toContain("Nothing matches these filters.");
		expect(emptyMarkup).toContain("Reset filters");
	});

	it("hides a defaultHidden column until the user switches it on", () => {
		const hiddenMarkup = renderToStaticMarkup(
			<DataTable
				query={query}
				columns={[
					{ id: "name", header: "Name", cell: (row) => row.name },
					{
						id: "domain",
						header: "Domain",
						defaultHidden: true,
						cell: () => "ada.test",
					},
					{
						id: "industry",
						header: "Industry",
						defaultHidden: true,
						cell: () => "retail",
					},
				]}
				rows={[{ id: "1", name: "Ada" }]}
				total={1}
				getRowId={(row) => row.id}
			/>,
		);
		expect(heads(hiddenMarkup)).toHaveLength(1);
		expect(hiddenMarkup).not.toContain("ada.test");
		expect(hiddenMarkup).not.toContain("retail");
	});
});

describe("fitColumnWidths", () => {
	const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0);

	it("keeps the asked widths when they fit", () => {
		expect(fitColumnWidths(1200, [230, 90, 130])).toEqual([230, 90, 130]);
	});

	it("shrinks every column so the first one keeps its room", () => {
		const widths = fitColumnWidths(600, [230, 230, 130]);
		expect(sum(widths)).toBeLessThanOrEqual(600 - TABLE.column.primaryMinPx);
		for (const width of widths)
			expect(width).toBeGreaterThanOrEqual(TABLE.column.minPx);
	});

	it("never asks for more room than there is, even below the minimum", () => {
		const widths = fitColumnWidths(400, [200, 200, 200, 200, 200]);
		expect(sum(widths)).toBeLessThanOrEqual(400 - TABLE.column.primaryMinPx);
	});
});

describe("a page past the end", () => {
	const state = { page: 4, pageSize: 25, total: 75, rows: 0, loading: false };

	it("goes to the last page that still has rows", () => {
		expect(pageAfterEnd(state)).toBe(3);
		expect(pageAfterEnd({ ...state, page: 9, total: 1 })).toBe(1);
	});

	it("stays while rows show, while loading and when the list is empty", () => {
		expect(pageAfterEnd({ ...state, rows: 1 })).toBeNull();
		expect(pageAfterEnd({ ...state, loading: true })).toBeNull();
		expect(pageAfterEnd({ ...state, total: 0 })).toBeNull();
		expect(pageAfterEnd({ ...state, page: 3 })).toBeNull();
	});

	it("shows a spinner, not the empty text, until the page moves", () => {
		const markup = renderToStaticMarkup(
			<DataTable
				query={{ ...query, page: 4 }}
				columns={[{ id: "name", header: "Name", cell: () => "x" }]}
				rows={[]}
				total={75}
				getRowId={() => "1"}
				empty="Nobody here"
			/>,
		);

		expect(markup).not.toContain("Nobody here");
	});
});

describe("pageWindow", () => {
	it("shows the first, the last and the pages around the current one", () => {
		expect(pageWindow(1, 1)).toEqual([1]);
		expect(pageWindow(5, 10)).toEqual([1, 4, 5, 6, 10]);
		expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
	});
});
