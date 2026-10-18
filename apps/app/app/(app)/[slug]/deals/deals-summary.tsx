"use client";

import { formatMoneyWhole } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { dealsSearchParams } from "./deals-search-params";

export function DealsSummary({ fallback }: { fallback: string }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const { input } = useTableQuery(dealsSearchParams);
	const board = useQuery({
		...trpc.deals.board.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	if (!board.data) return fallback;

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
					amount: formatMoneyWhole(openValueCents, reportingCurrency, locale),
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
