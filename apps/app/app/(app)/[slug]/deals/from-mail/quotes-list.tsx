"use client";

import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { contactName } from "@/components/crm/contact-name";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import type { RouterOutputs } from "@/lib/trpc/types";
import { offerLine } from "./quotes-line";

export type Quote = RouterOutputs["quotes"]["list"]["rows"][number];

type QuoteActions = {
	busy: string | null;
	onCreate: (row: Quote) => void;
	onDismiss: (row: Quote) => void;
};

type QuoteOpen = { onOpen: (row: Quote) => void };

export function quotesPage<T>(
	rows: readonly T[],
	page: number,
	pageSize: number,
): T[] {
	const start = (Math.max(page, 1) - 1) * pageSize;
	return rows.slice(start, start + pageSize);
}

function columns(
	t: Translate,
	unit: string,
	actions: QuoteActions,
): DataTableColumn<Quote>[] {
	return [
		{
			id: "company",
			header: t("Company"),
			hideable: false,
			cell: (row) => (
				<span className="flex min-w-0 items-center gap-2">
					<EntityLogo name={row.company.name} size="sm" />
					<span className="truncate">{row.company.name}</span>
				</span>
			),
		},
		{
			id: "contact",
			header: t("Contact"),
			size: 160,
			cell: (row) =>
				row.contact ? contactName(row.contact) : <EmptyCellValue />,
		},
		{
			id: "quote",
			header: t("The offer you sent"),
			size: 240,
			cell: (row) => offerLine(row) ?? t("No subject"),
		},
		{
			id: "quantity",
			header: t("Quantity"),
			size: 120,
			align: "right",
			cell: (row) =>
				row.quantityPallets === null ? (
					<EmptyCellValue />
				) : (
					<span className="tabular-nums">
						{t("{count} {unit}", { count: row.quantityPallets, unit })}
					</span>
				),
		},
		{
			id: "last",
			header: t("Last message"),
			size: 130,
			align: "right",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.lastMessageAt} />
				</span>
			),
		},
		{
			id: "actions",
			header: <span className="sr-only">{t("Actions")}</span>,
			label: t("Actions"),
			hideable: false,
			align: "right",
			control: true,
			size: 190,
			cell: (row) =>
				actions.busy === row.threadId ? (
					<Spinner className="ml-auto size-4" />
				) : (
					<span className="flex items-center justify-end gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => actions.onCreate(row)}
						>
							{t("Create deal")}
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t("Put aside")}
							onClick={() => actions.onDismiss(row)}
						>
							<Icon icon={Close} />
						</Button>
					</span>
				),
		},
	];
}

export function QuotesList({
	query,
	rows,
	unit,
	onOpen,
	...actions
}: QuoteActions &
	QuoteOpen & {
		query: TableQueryState;
		rows: Quote[];
		unit: string;
	}) {
	const t = useT();

	return (
		<DataTable
			query={query}
			columns={columns(t, unit, actions)}
			rows={quotesPage(rows, query.page, query.pageSize)}
			total={rows.length}
			getRowId={(row) => row.threadId}
			onRowClick={onOpen}
		/>
	);
}
