"use client";

import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { DealsBoard } from "./deals-board";
import { DealsTable } from "./deals-table";
import { dealViewParsers } from "./deals-view-params";
import { DealsViewTabs } from "./deals-view-tabs";

export function DealsView() {
	const [params] = useQueryStates(dealViewParsers);
	const view = params[SEARCH_PARAM.deals.view];

	if (view === "pipeline") return <DealsBoard />;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<DealsViewTabs />
			{view === "closed" ? <DealsTable status="closed" /> : <DealsTable />}
		</div>
	);
}
