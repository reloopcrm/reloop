import {
	createLoader,
	createParser,
	createSerializer,
	parseAsBoolean,
	parseAsInteger,
	parseAsStringLiteral,
} from "nuqs/server";
import { z } from "zod";
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

const windowStart = z.iso.datetime({ offset: true });

const parseAsWindowStart = createParser({
	parse: (value: string) =>
		windowStart.safeParse(value).success ? value : null,
	serialize: (value: string) => value,
});

export function windowDay(since: string): Date {
	return new Date(`${since.slice(0, 10)}T00:00:00Z`);
}

export const winBackScopeParsers = {
	scope: parseAsStringLiteral(["me", "everyone"] as const).withDefault(
		"everyone",
	),
	quiet: parseAsInteger.withDefault(0),
	rejected: parseAsBoolean.withDefault(false),
	replied: parseAsBoolean.withDefault(false),
	since: parseAsWindowStart,
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
	return winBackUrl(listPath, { replied: true, scope, since });
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
		since: string | null;
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
		since: scope.replied && scope.since ? scope.since : undefined,
	};
}
