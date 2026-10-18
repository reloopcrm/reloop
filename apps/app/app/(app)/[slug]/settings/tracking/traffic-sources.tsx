"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

function columns(t: Translate): SimpleTableColumn[] {
	return [
		{ id: "source", header: t("Source") },
		{ id: "medium", header: t("Traffic medium"), width: "w-32" },
		{ id: "views", header: t("Page views"), width: "w-28", align: "right" },
		{ id: "contacts", header: t("Contacts"), width: "w-24", align: "right" },
	];
}

export function TrafficSources() {
	const t = useT();
	const trpc = useTRPC();
	const sources = useQuery(trpc.tracking.sources.queryOptions());

	if (!sources.data) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Traffic sources")}</CardTitle>
				<CardDescription>
					{t(
						"Where your visitors come from. Only somebody who submitted a form reaches a record.",
					)}
				</CardDescription>
			</CardHeader>

			{sources.data.length === 0 ? (
				<CardTableEmpty>
					{t(
						"No sources yet. They appear once the script records its first page view.",
					)}
				</CardTableEmpty>
			) : (
				<SimpleTable columns={columns(t)}>
					{sources.data.map((row) => (
						<SimpleTableRow key={`${row.source}-${row.medium ?? ""}`}>
							<TableCell className={CELL}>{row.source}</TableCell>
							<TableCell className={`${CELL} text-muted-foreground`}>
								{row.medium ?? "-"}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.views.toLocaleString()}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.contacts.toLocaleString()}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</Card>
	);
}
