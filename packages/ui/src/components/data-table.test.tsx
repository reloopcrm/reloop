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

	it("truncates a text cell", () => {
		expect(text).toContain("truncate");
	});

	it("never truncates a control cell and gives it a fixed width", () => {
		expect(control).not.toContain("truncate");
		expect(control).toContain("w-17");
	});
});
