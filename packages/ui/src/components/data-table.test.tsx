import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const parser = { withDefault: (value: unknown) => value };

mock.module("nuqs", () => ({
	parseAsArrayOf: () => parser,
	parseAsString: parser,
	useQueryState: (_key: string, fallback: unknown) => [fallback, () => {}],
}));

const { DataTable } = await import("./data-table");

const query = {
	page: 1,
	pageSize: 25,
	sort: "name",
	dir: "asc" as const,
	tab: "all",
	filters: {},
	setPage: async () => {},
	setSort: () => {},
	setDir: () => {},
	setTab: () => {},
	setFilter: () => {},
	toggleSort: () => {},
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
		/>,
	);
	const [text, control] = cells(markup);
	const [textHead, controlHead] = heads(markup);

	it("truncates a text cell", () => {
		expect(text).toContain("truncate");
	});

	it("never truncates a control cell and gives it a fixed width", () => {
		expect(control).not.toContain("truncate");
		expect(control).toContain("w-17");
	});

	it("never truncates a text column header, so the column is at least as wide as its heading", () => {
		expect(textHead).not.toContain("truncate");
		expect(textHead).toContain("whitespace-nowrap");
	});

	it("lets a text cell shrink below its content so it truncates instead of widening the column", () => {
		expect(text).toContain("max-w-0");
	});

	it("sizes columns automatically instead of fixing them", () => {
		expect(markup).not.toContain("table-fixed");
	});

	it("never truncates a control column header", () => {
		expect(controlHead).not.toContain("truncate");
	});

	it("lets the select-all checkbox header overflow its cell", () => {
		const selectionMarkup = renderToStaticMarkup(
			<DataTable
				query={query}
				columns={[{ id: "name", header: "Name", cell: (row) => row.name }]}
				rows={[{ id: "1", name: "Ada" }]}
				total={1}
				getRowId={(row) => row.id}
				selection={{
					state: {
						ids: [],
						count: 0,
						has: () => false,
						toggle: () => {},
						toggleAll: () => {},
						clear: () => {},
						allSelected: false,
						someSelected: false,
					},
					actions: null,
				}}
			/>,
		);
		const [checkboxHead] = heads(selectionMarkup);
		expect(checkboxHead).toContain("overflow-visible");
	});
});
