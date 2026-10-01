"use client";

import type { DataTableQuickFilter } from "@crm/ui/components/data-table";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { useT } from "@/lib/i18n/client";

export function useRecordQuickFilters(
	query: TableQueryState,
): DataTableQuickFilter[] {
	const t = useT();

	const quick = (id: string, value: string, label: string) => {
		const selected = query.filters[id] ?? [];
		const active = selected.length === 1 && selected[0] === value;
		return {
			id: `${id}:${value}`,
			label,
			active,
			onToggle: () => query.setFilter(id, active ? [] : [value]),
		};
	};

	return [
		quick("standing", "customer", t("Customers")),
		quick("activity", "30", t("Active in 30 days")),
	].filter((filter) => !filter.active);
}
