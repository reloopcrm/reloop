import {
	createLoader,
	createSerializer,
	parseAsBoolean,
	parseAsInteger,
	parseAsIsoDateTime,
	parseAsStringLiteral,
} from "nuqs/server";
import {
	createListSearchParams,
	type ListInput,
} from "@/components/data-table/list-search-params";

export const winBackTable = createListSearchParams({
	defaultSort: "potential",
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
	replied: parseAsBoolean.withDefault(false),
	since: parseAsIsoDateTime,
};

export const winBackParsers = {
	...winBackTable.parsers,
	...winBackScopeParsers,
};

export const winBackSearchParams = createLoader(winBackParsers);

const winBackUrl = createSerializer(winBackScopeParsers);

export function wroteBackListHref(
	listPath: string,
	scope: WinBackScope,
	since: string,
) {
	return winBackUrl(listPath, { replied: true, scope, since: new Date(since) });
}

export type WinBackScope = "me" | "everyone";

const BANDS = ["high", "medium", "low"] as const;

type Band = (typeof BANDS)[number];

function bandsOf(values: readonly string[]): Band[] {
	return BANDS.filter((band) => values.includes(band));
}

export function winBackInput(
	table: ListInput<never, "potential">,
	scope: {
		scope: WinBackScope;
		quiet: number;
		rejected: boolean;
		replied: boolean;
		since: Date | null;
	},
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
		replied: scope.replied,
		since: scope.replied && scope.since ? scope.since.toISOString() : undefined,
	};
}
