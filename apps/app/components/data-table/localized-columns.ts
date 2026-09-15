"use client";

import type { DataTableColumn } from "@crm/ui/components/data-table";
import { useMemo } from "react";
import { useT } from "@/lib/i18n/client";

export type LabeledColumn<TRow> = DataTableColumn<TRow> & { header: string };

export function useLocalizedColumns<TRow>(
	columns: LabeledColumn<TRow>[],
): DataTableColumn<TRow>[] {
	const t = useT();
	return useMemo(
		() =>
			columns.map((column) => ({
				...column,
				header: t(column.header),
				label: column.label ? t(column.label) : undefined,
			})),
		[columns, t],
	);
}
