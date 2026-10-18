"use client";

import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useQueryStates } from "nuqs";
import { useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { type DealView, dealViewParsers } from "./deals-view-params";

const VIEW_LABELS = {
	pipeline: "Pipeline",
	list: "List",
	closed: "Closed",
} satisfies Record<DealView, string>;

export function DealsViewTabs() {
	const t = useT();
	const [params, setParams] = useQueryStates(dealViewParsers);
	const view = params[SEARCH_PARAM.deals.view];

	return (
		<Tabs
			value={view}
			onValueChange={(next) =>
				setParams({ [SEARCH_PARAM.deals.view]: next as DealView })
			}
		>
			<TabsList aria-label={t("Deals view")}>
				{(Object.keys(VIEW_LABELS) as DealView[]).map((option) => (
					<TabsTrigger key={option} value={option}>
						{t(VIEW_LABELS[option])}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
