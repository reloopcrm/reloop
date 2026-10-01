"use client";

import { DataTable, type DataTableFacet } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	EmailIcon,
	NumberIcon,
	SignalIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { LinkText } from "@crm/ui/components/link-text";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { useFieldColumns } from "@/components/crm/fields/field-columns";
import { useFieldFacets } from "@/components/crm/fields/field-facets";
import { OwnerCell } from "@/components/crm/owner-cell";
import { useRecordQuickFilters } from "@/components/crm/record-quick-filters";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { PotentialCell, StandingCell } from "@/components/crm/standing-cell";
import { ListMoreMenu } from "@/components/data-table/list-more-menu";
import { ListSearch } from "@/components/data-table/list-search";
import {
	type LabeledColumn,
	useLocalizedColumns,
} from "@/components/data-table/localized-columns";
import { SavedViewsMenu } from "@/components/data-table/saved-views-menu";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { ACTIVITY_FACET_OPTIONS } from "@/lib/activity-recency";
import {
	ENRICHMENT_FACET_OPTIONS,
	ENRICHMENT_POLL_MS,
	isEnriching,
} from "@/lib/enrichment-status";
import { useT } from "@/lib/i18n/client";
import {
	POTENTIAL_FACET_OPTIONS,
	STANDING_FACET_OPTIONS,
} from "@/lib/record-standing";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CompaniesBulkActions } from "./companies-bulk-actions";
import { companiesSearchParams } from "./companies-search-params";

type CompanyRow = RouterOutputs["companies"]["list"]["rows"][number];

const COLUMNS: LabeledColumn<CompanyRow>[] = [
	{
		id: "name",
		header: "Company",
		icon: CompaniesIcon,
		sortable: true,
		hideable: false,
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2">
				<EntityLogo
					src={row.iconUrl ?? row.logoUrl}
					darkSrc={row.iconDarkUrl}
					tone={row.iconTone as EntityLogoTone | null | undefined}
					name={row.name}
					size="sm"
				/>
				<span className="truncate">{row.name}</span>
			</span>
		),
	},
	{
		id: "domain",
		header: "Domain",
		icon: EmailIcon,
		sortable: true,
		size: 230,
		cell: (row) =>
			row.domain ? <LinkText>{row.domain}</LinkText> : <EmptyCellValue />,
	},
	{
		id: "industry",
		header: "Industry",
		icon: TextIcon,
		sortable: true,
		size: 180,
		defaultHidden: true,
		cell: (row) =>
			row.industry ? (
				<span className="truncate">{row.industry}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "contacts",
		header: "People",
		icon: ContactsIcon,
		sortable: true,
		align: "right",
		size: 110,
		cell: (row) => <span className="tabular-nums">{row.contactCount}</span>,
	},
	{
		id: "standing",
		header: "Status",
		icon: SignalIcon,
		sortable: true,
		size: 130,
		defaultHidden: true,
		cell: (row) => <StandingCell standing={row.standing} />,
	},
	{
		id: "potential",
		header: "Potential",
		icon: SignalIcon,
		sortable: true,
		size: 130,
		defaultHidden: true,
		cell: (row) => <PotentialCell potential={row.potential} />,
	},
	{
		id: "lastActivity",
		header: "Last contact",
		icon: DateIcon,
		sortable: true,
		size: 130,
		cell: (row) =>
			row.lastActivityAt ? (
				<LocalRelativeTime date={row.lastActivityAt} />
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "deals",
		header: "Open deals",
		icon: NumberIcon,
		sortable: true,
		align: "right",
		size: 120,
		defaultHidden: true,
		cell: (row) => <span className="tabular-nums">{row.openDealCount}</span>,
	},
	{
		id: "owner",
		header: "Owner",
		icon: ContactsIcon,
		sortable: true,
		size: 160,
		defaultHidden: true,
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "createdAt",
		header: "Created",
		label: "Created date",
		icon: DateIcon,
		sortable: true,
		size: 130,
		defaultHidden: true,
		cell: (row) => <LocalRelativeTime date={row.createdAt} />,
	},
	{
		id: "enrichment",
		header: "Enrichment",
		label: "Enrichment status",
		icon: SignalIcon,
		defaultHidden: true,
		size: 160,
		cell: (row) => (
			<EnrichmentIndicator status={row.enrichmentStatus} queued={row.queued} />
		),
	},
];

const ARCHIVED_COLUMNS: LabeledColumn<CompanyRow>[] = [
	{
		id: "archivedAt",
		header: "Archived",
		label: "Archived date",
		icon: DateIcon,
		sortable: true,
		size: 130,
		cell: (row) =>
			row.archivedAt ? (
				<LocalRelativeTime date={row.archivedAt} />
			) : (
				<EmptyCellValue />
			),
	},
];

export function CompaniesTable() {
	const t = useT();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const table = useTableQuery(companiesSearchParams);
	const { query, input, setArchived } = table;

	const companies = useQuery({
		...trpc.companies.list.queryOptions(input),
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			query.state.data?.rows.some((row) =>
				isEnriching(row.enrichmentStatus, row.queued),
			)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const rows = companies.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.id), [rows]),
	);

	const facetCounts = companies.data?.facetCounts;
	const fieldFacets = useFieldFacets("COMPANY", facetCounts);

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: t("Owner"),
			options: [
				{ value: "unassigned", label: t("Unassigned") },
				...(users.data ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				})),
			].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "industry",
			label: t("Industry"),
			options: Object.keys(facetCounts?.industry ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "enrichment",
			label: t("Enrichment"),
			options: ENRICHMENT_FACET_OPTIONS.filter(
				(option) => (facetCounts?.enrichment?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
		{
			id: "standing",
			label: t("Status"),
			options: STANDING_FACET_OPTIONS.filter(
				(option) => (facetCounts?.standing?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
		{
			id: "potential",
			label: t("Potential"),
			options: POTENTIAL_FACET_OPTIONS.filter(
				(option) => (facetCounts?.potential?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
		{
			id: "activity",
			label: t("Activity"),
			options: ACTIVITY_FACET_OPTIONS.filter(
				(option) => (facetCounts?.activity?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
		...fieldFacets,
	];

	const quickFilters = useRecordQuickFilters(query);

	const fieldColumns = useFieldColumns<CompanyRow>("COMPANY");
	const baseColumns = useLocalizedColumns(COLUMNS);
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
			search={<ListSearch placeholder={t("Search companies")} />}
			quickFilters={quickFilters}
			actions={
				<>
					<SavedViewsMenu entity="COMPANY" table={table} />
					<ListMoreMenu
						entity="companies"
						input={input}
						archived={input.archived}
						onArchivedChange={setArchived}
					/>
				</>
			}
			columns={columns}
			rows={rows}
			total={companies.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<CompaniesBulkActions
						ids={selection.ids}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => row.name,
			}}
			getRowId={(row) => row.id}
			loading={companies.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "company", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "company", id: row.id })}
			empty={
				input.archived
					? t("No archived companies.")
					: t("No companies match this view.")
			}
		/>
	);
}
