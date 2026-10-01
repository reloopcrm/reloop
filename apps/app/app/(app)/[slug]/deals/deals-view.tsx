"use client";

import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { DealsBoard } from "./deals-board";
import { DealsTable } from "./deals-table";
import { dealViewParsers } from "./deals-view-params";

export function DealsView({ userId }: { userId: string }) {
	const [params] = useQueryStates(dealViewParsers);
	const view = params[SEARCH_PARAM.deals.view];

	if (view === "pipeline") return <DealsBoard />;

	return (
		<DealsTable
			key={view}
			status={view === "closed" ? "closed" : "open"}
			userId={userId}
		/>
	);
}
