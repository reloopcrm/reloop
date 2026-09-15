import {
	createLoader,
	parseAsBoolean,
	parseAsInteger,
	parseAsStringLiteral,
} from "nuqs/server";
import {
	createListSearchParams,
	type ListInput,
} from "@/components/data-table/list-search-params";

export const winBackTable = createListSearchParams({
	defaultSort: "",
	defaultDir: "desc",
	pageSize: 25,
	facetIds: ["potential"] as const,
});

export const winBackScopeParsers = {
	scope: parseAsStringLiteral(["me", "everyone"] as const).withDefault(
		"everyone",
	),
	quiet: parseAsInteger.withDefault(0),
	rejected: parseAsBoolean.withDefault(false),
};

export const winBackParsers = {
	...winBackTable.parsers,
	...winBackScopeParsers,
};

export const winBackSearchParams = createLoader(winBackParsers);

export type WinBackScope = "me" | "everyone";

const BANDS = ["high", "medium", "low"] as const;

type Band = (typeof BANDS)[number];

function bandsOf(values: readonly string[]): Band[] {
	return BANDS.filter((band) => values.includes(band));
}

export function winBackInput(
	table: ListInput<never, "potential">,
	scope: { scope: WinBackScope; quiet: number; rejected: boolean },
) {
	return {
		q: table.q,
		sort: table.sort,
		dir: table.dir,
		page: table.page,
		pageSize: table.pageSize,
		potential: bandsOf(table.potential),
		scope: scope.scope,
		quietForDays: scope.quiet,
		rejected: scope.rejected,
	};
}
