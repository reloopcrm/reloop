"use client";

import type { DealStage } from "@crm/db/enums";
import {
	DataTable,
	type DataTableFacet,
	type DataTableQuickFilter,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	DealsIcon,
	NumberIcon,
	SignalIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { Status } from "@crm/ui/components/mark";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { useFieldFacets } from "@/components/crm/fields/field-facets";
import { OwnerCell } from "@/components/crm/owner-cell";
import { DealAmount } from "@/components/crm/record-sheet/record-parts";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu } from "@/components/crm/stage-change";
import { ListMoreMenu } from "@/components/data-table/list-more-menu";
import { ListSearch } from "@/components/data-table/list-search";
import {
	type LabeledColumn,
	useLocalizedColumns,
} from "@/components/data-table/localized-columns";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	daysUntil,
	LocalComputed,
	LocalDay,
	LocalRelativeDate,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { dealStageMark } from "@/lib/deal-stage";
import { useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
	useDealStageLabel,
	useDealStageOptions,
} from "@/lib/use-deal-stage-label";
import { DealsBulkActions } from "./deals-bulk-actions";
import { dealsSearchParams } from "./deals-search-params";
import { DealsViewTabs } from "./deals-view-tabs";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

const CLOSING_THIS_MONTH = "this-month";

const SIZE = {
	company: 220,
	stage: 160,
	value: 110,
	close: 120,
	inStage: 100,
	owner: 170,
	outcome: 110,
	closed: 110,
	reason: 200,
	created: 120,
	lastActivity: 140,
	archived: 140,
} as const;

function DealName({ row }: { row: DealRow }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<EntityLogo
				src={row.company.iconUrl ?? row.company.logoUrl}
				darkSrc={row.company.iconDarkUrl}
				tone={row.company.iconTone as EntityLogoTone | null | undefined}
				name={row.company.name}
				size="sm"
			/>
			<span className="truncate text-foreground">{row.name}</span>
		</span>
	);
}

function StageStatus({ stage }: { stage: DealStage }) {
	const stageLabel = useDealStageLabel();
	return <Status tone={dealStageMark(stage)}>{stageLabel(stage)}</Status>;
}

function DaysInStage({ since }: { since: string }) {
	const t = useT();
	return (
		<LocalComputed
			text={t("{days} d", { days: Math.max(0, -daysUntil(since)) })}
		/>
	);
}

const NAME_COLUMN: LabeledColumn<DealRow> = {
	id: "name",
	header: "Deal",
	icon: DealsIcon,
	sortable: true,
	hideable: false,
	cell: (row) => <DealName row={row} />,
};

const COMPANY_COLUMN: LabeledColumn<DealRow> = {
	id: "company",
	header: "Company",
	icon: CompaniesIcon,
	sortable: true,
	size: SIZE.company,
	cell: (row) => row.company.name,
};

const VALUE_COLUMN: LabeledColumn<DealRow> = {
	id: "amount",
	header: "Value",
	icon: NumberIcon,
	sortable: true,
	align: "right",
	size: SIZE.value,
	cell: (row) => (
		<DealAmount amountCents={row.amountCents} currency={row.currency} />
	),
};

const OWNER_COLUMN: LabeledColumn<DealRow> = {
	id: "owner",
	header: "Owner",
	icon: ContactsIcon,
	sortable: true,
	size: SIZE.owner,
	defaultHidden: true,
	cell: (row) => <OwnerCell owner={row.owner} />,
};

const CREATED_COLUMN: LabeledColumn<DealRow> = {
	id: "createdAt",
	header: "Created",
	label: "Created date",
	icon: DateIcon,
	sortable: true,
	align: "right",
	size: SIZE.created,
	defaultHidden: true,
	cell: (row) => <LocalRelativeTime date={row.createdAt} />,
};

const LAST_ACTIVITY_COLUMN: LabeledColumn<DealRow> = {
	id: "lastActivity",
	header: "Last activity",
	icon: DateIcon,
	sortable: true,
	align: "right",
	size: SIZE.lastActivity,
	defaultHidden: true,
	cell: (row) =>
		row.lastActivityAt ? (
			<LocalRelativeTime date={row.lastActivityAt} />
		) : (
			<EmptyCellValue />
		),
};

const OPEN_COLUMNS: LabeledColumn<DealRow>[] = [
	NAME_COLUMN,
	COMPANY_COLUMN,
	{
		id: "stage",
		header: "Stage",
		icon: SignalIcon,
		sortable: true,
		size: SIZE.stage,
		cell: (row) => <DealStageMenu dealId={row.id} stage={row.stage} />,
	},
	VALUE_COLUMN,
	{
		id: "expectedCloseDate",
		header: "Close date",
		icon: DateIcon,
		sortable: true,
		size: SIZE.close,
		cell: (row) =>
			row.expectedCloseDate ? (
				<LocalDay date={row.expectedCloseDate} />
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "inStage",
		header: "In stage",
		icon: DateIcon,
		align: "right",
		size: SIZE.inStage,
		defaultHidden: true,
		cell: (row) => <DaysInStage since={row.stageChangedAt} />,
	},
	OWNER_COLUMN,
	CREATED_COLUMN,
	LAST_ACTIVITY_COLUMN,
];

const CLOSED_COLUMNS: LabeledColumn<DealRow>[] = [
	NAME_COLUMN,
	COMPANY_COLUMN,
	{
		id: "stage",
		header: "Outcome",
		icon: SignalIcon,
		sortable: true,
		size: SIZE.outcome,
		cell: (row) => <StageStatus stage={row.stage} />,
	},
	VALUE_COLUMN,
	{
		id: "closedAt",
		header: "Closed",
		icon: DateIcon,
		size: SIZE.closed,
		cell: (row) =>
			row.closedAt ? (
				<LocalRelativeDate date={row.closedAt} />
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "closedReason",
		header: "Reason",
		icon: TextIcon,
		size: SIZE.reason,
		cell: (row) => row.closedReason ?? <EmptyCellValue />,
	},
	OWNER_COLUMN,
	CREATED_COLUMN,
	LAST_ACTIVITY_COLUMN,
];

const ARCHIVED_COLUMNS: LabeledColumn<DealRow>[] = [
	{
		id: "archivedAt",
		header: "Archived",
		label: "Archived date",
		icon: DateIcon,
		sortable: true,
		align: "right",
		size: SIZE.archived,
		cell: (row) =>
			row.archivedAt ? (
				<LocalRelativeTime date={row.archivedAt} />
			) : (
				<EmptyCellValue />
			),
	},
];

function isOnly(values: string[] | undefined, value: string): boolean {
	return values?.length === 1 && values[0] === value;
}

export function DealsTable({
	status,
	userId,
}: {
	status: "open" | "closed";
	userId: string;
}) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const table = useTableQuery(dealsSearchParams);
	const { query, setArchived } = table;
	const input = { ...table.input, status };
	const closed = status === "closed";

	const deals = useQuery({
		...trpc.deals.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = deals.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);
	const settledIds = useMemo(() => {
		const matching = new Set(
			rows
				.filter((row) => Boolean(row.archivedAt) === input.archived)
				.map((row) => row.id),
		);
		return selection.ids.filter((id) => matching.has(id));
	}, [rows, input.archived, selection.ids]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clearing on archived-mode change is the entire purpose of this effect.
	useEffect(() => {
		selection.clear();
	}, [input.archived]);

	const toggleArchived = (next: boolean) => {
		selection.clear();
		if (!next && query.sort === "archivedAt") query.setSort("");
		setArchived(next);
	};

	const facetCounts = deals.data?.facetCounts;
	const fieldFacets = useFieldFacets("DEAL", facetCounts);
	const stageOptions = useDealStageOptions();

	const closingThisMonth =
		!closed && isOnly(query.filters.closing, CLOSING_THIS_MONTH);
	const ownerIsMe = isOnly(query.filters.owner, userId);

	const quickFilters: DataTableQuickFilter[] = [
		...(closed
			? []
			: [
					{
						id: "closing-this-month",
						label: t("Closing this month"),
						active: closingThisMonth,
						onToggle: () =>
							query.setFilter(
								"closing",
								closingThisMonth ? [] : [CLOSING_THIS_MONTH],
							),
					},
				]),
		{
			id: "owner-is-me",
			label: t("Owner is me"),
			active: ownerIsMe,
			onToggle: () => query.setFilter("owner", ownerIsMe ? [] : [userId]),
		},
	];

	const facets: DataTableFacet[] = [
		...(ownerIsMe
			? []
			: [
					{
						id: "owner",
						label: t("Owner"),
						options: (users.data ?? []).flatMap((user) =>
							(facetCounts?.owner?.[user.id] ?? 0) > 0
								? [{ value: user.id, label: user.name }]
								: [],
						),
					},
				]),
		{
			id: "stage",
			label: closed ? t("Outcome") : t("Stage"),
			options: stageOptions.filter(
				(option) => (facetCounts?.stage?.[option.value] ?? 0) > 0,
			),
		},
		...(closed || closingThisMonth
			? []
			: [
					{
						id: "closing",
						label: t("Closing"),
						options: CLOSING_OPTIONS.flatMap((option) =>
							(facetCounts?.closing?.[option.value] ?? 0) > 0
								? [{ value: option.value, label: t(option.label) }]
								: [],
						),
					},
				]),
		...fieldFacets,
	];

	const openValueCents = deals.data?.openValueCents;
	const reportingCurrency = deals.data?.reportingCurrency;
	const unconverted = deals.data?.unconverted;
	const uncounted = unconverted?.count ?? 0;
	const openPipelineCents = openValueCents ?? (uncounted > 0 ? 0 : null);

	const fieldColumns = useFieldColumns<DealRow>("DEAL");
	const baseColumns = useLocalizedColumns(
		closed ? CLOSED_COLUMNS : OPEN_COLUMNS,
	);
	const archivedColumns = useLocalizedColumns(ARCHIVED_COLUMNS);
	const columns = useMemo(
		() =>
			input.archived
				? [...baseColumns, ...archivedColumns, ...fieldColumns]
				: [...baseColumns, ...fieldColumns],
		[baseColumns, archivedColumns, fieldColumns, input.archived],
	);

	return (
		<DataTable
			query={query}
			search={
				<div className="flex flex-wrap items-center gap-2">
					<DealsViewTabs />
					<ListSearch placeholder={t("Deal or company")} />
				</div>
			}
			quickFilters={quickFilters}
			actions={
				<ListMoreMenu
					entity="deals"
					input={input}
					archived={input.archived}
					onArchivedChange={toggleArchived}
				/>
			}
			columns={columns}
			rows={rows}
			total={deals.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<DealsBulkActions
						ids={settledIds}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={deals.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "deal", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "deal", id: row.id })}
			empty={
				input.archived
					? t("No archived deals.")
					: closed
						? t("Nothing has closed yet")
						: t("No deals match this view.")
			}
			meta={
				input.archived || closed || openPipelineCents === null ? undefined : (
					<span>
						{t("{count} deals", { count: deals.data?.total ?? 0 })} ·{" "}
						<span className="tabular-nums">
							{formatMoney(openPipelineCents, reportingCurrency, locale)}
						</span>{" "}
						{t("open pipeline")}
						{unconverted && unconverted.count > 0 ? (
							<span className="text-muted-foreground">
								{" "}
								·{" "}
								{t("{count} not counted (no {currencies} rate)", {
									count: unconverted.count,
									currencies: unconverted.currencies.join(", "),
								})}
							</span>
						) : null}
					</span>
				)
			}
		/>
	);
}
