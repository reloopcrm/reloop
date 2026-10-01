"use client";

import type { DataTableQuickFilter } from "@crm/ui/components/data-table";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { useT } from "@/lib/i18n/client";

const RECORD_QUICK_FILTERS = {
	customers: { facet: "standing", value: "customer" },
	recent: { facet: "activity", value: "30" },
} as const;

export function useRecordQuickFilters(
	query: TableQueryState,
): DataTableQuickFilter[] {
	const t = useT();

	const quick = (
		{ facet, value }: { facet: string; value: string },
		label: string,
	) => {
		const selected = query.filters[facet] ?? [];
		const active = selected.length === 1 && selected[0] === value;
		return {
			id: `${facet}:${value}`,
			label,
			active,
			onToggle: () => query.setFilter(facet, active ? [] : [value]),
		};
	};

	return [
		quick(RECORD_QUICK_FILTERS.customers, t("Customers")),
		quick(RECORD_QUICK_FILTERS.recent, t("Active in 30 days")),
	].filter((filter) => !filter.active);
}
