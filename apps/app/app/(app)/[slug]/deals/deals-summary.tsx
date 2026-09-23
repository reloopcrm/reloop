"use client";

import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useLocale, useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { dealsSearchParams } from "./deals-search-params";
import { dealViewParsers } from "./deals-view-params";

export function DealsSummary({ fallback }: { fallback: string }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const [params] = useQueryStates(dealViewParsers);
	const pipeline = params[SEARCH_PARAM.deals.view] === "pipeline";
	const { input } = useTableQuery(dealsSearchParams);
	const board = useQuery({
		...trpc.deals.board.queryOptions(input),
		enabled: pipeline,
		placeholderData: (previous) => previous,
	});

	if (!pipeline || !board.data) return fallback;

	const {
		openCount,
		openValueCents,
		reportingCurrency,
		wonCount,
		lostCount,
		unconverted,
	} = board.data;

	return [
		t("{count} open", { count: openCount }),
		openValueCents === null
			? null
			: t("{amount} in the pipeline", {
					amount: formatMoney(openValueCents, reportingCurrency, locale),
				}),
		t("{won} won and {lost} lost in the last 90 days", {
			won: wonCount,
			lost: lostCount,
		}),
		unconverted.count > 0
			? t("{count} not counted (no {currencies} rate)", {
					count: unconverted.count,
					currencies: unconverted.currencies.join(", "),
				})
			: null,
	]
		.filter(Boolean)
		.join(" · ");
}
