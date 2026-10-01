"use client";

import { DataTable, type DataTableFacet } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	EmailIcon,
	SignalIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { LinkText } from "@crm/ui/components/link-text";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CompanyCell } from "@/components/crm/company-cell";
import { contactName } from "@/components/crm/contact-name";
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
import { useT } from "@/lib/i18n/client";
import {
	POTENTIAL_FACET_OPTIONS,
	STANDING_FACET_OPTIONS,
} from "@/lib/record-standing";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ContactsBulkActions } from "./contacts-bulk-actions";
import { contactsSearchParams } from "./contacts-search-params";

type ContactRow = RouterOutputs["contacts"]["list"]["rows"][number];

const COLUMNS: LabeledColumn<ContactRow>[] = [
	{
		id: "name",
		header: "Person",
		icon: ContactsIcon,
		sortable: true,
		hideable: false,
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2">
				<PersonAvatar
					src={row.imageUrl}
					name={contactName(row)}
					email={row.email}
					size="sm"
				/>
				<span className="truncate">{contactName(row)}</span>
			</span>
		),
	},
	{
		id: "company",
		header: "Company",
		icon: CompaniesIcon,
		sortable: true,
		size: 230,
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "email",
		header: "Email",
		icon: EmailIcon,
		sortable: true,
		size: 260,
		cell: (row) =>
			row.email ? <LinkText>{row.email}</LinkText> : <EmptyCellValue />,
	},
	{
		id: "title",
		header: "Title",
		icon: TextIcon,
		sortable: true,
		size: 170,
		defaultHidden: true,
		cell: (row) =>
			row.title ? (
				<span className="truncate">{row.title}</span>
			) : (
				<EmptyCellValue />
			),
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
];

const ARCHIVED_COLUMNS: LabeledColumn<ContactRow>[] = [
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

export function ContactsTable() {
	const t = useT();
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const prefetchRecord = usePrefetchRecord();
	const table = useTableQuery(contactsSearchParams);
	const { query, input, setArchived } = table;

	const contacts = useQuery({
		...trpc.contacts.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const [companyQuery, setCompanyQuery] = useState("");
	const [companyText, setCompanyText] = useSearchInput(
		companyQuery,
		setCompanyQuery,
	);
	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: companyQuery }),
		placeholderData: (previous) => previous,
	});

	const rows = contacts.data?.rows ?? [];
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

	const facetCounts = contacts.data?.facetCounts;
	const fieldFacets = useFieldFacets("CONTACT", facetCounts);

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
			id: "company",
			label: t("Company"),
			searchable: true,
			search: companyText,
			onSearchChange: setCompanyText,
			stale: companies.isFetching || companyText.trim() !== companyQuery.trim(),
			empty: companies.isFetching ? t("Searching…") : t("No company matches."),
			options: [
				...(companyQuery.trim()
					? []
					: [{ value: "none", label: t("No company") }]),
				...(companies.data ?? []).map((company) => ({
					value: company.id,
					label: company.name,
				})),
			].filter((option) => (facetCounts?.company?.[option.value] ?? 0) > 0),
		},
		{
			id: "title",
			label: t("Title"),
			options: Object.keys(facetCounts?.title ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "seniority",
			label: t("Seniority"),
			options: Object.keys(facetCounts?.seniority ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "persona",
			label: t("Persona"),
			options: Object.keys(facetCounts?.persona ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
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

	const fieldColumns = useFieldColumns<ContactRow>("CONTACT");
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
			className={selection.count > 0 ? "max-lg:pb-56" : undefined}
			query={query}
			search={<ListSearch placeholder={t("Search contacts")} />}
			quickFilters={quickFilters}
			actions={
				<>
					<SavedViewsMenu entity="CONTACT" table={table} />
					<ListMoreMenu
						entity="contacts"
						input={input}
						archived={input.archived}
						onArchivedChange={toggleArchived}
					/>
				</>
			}
			columns={columns}
			rows={rows}
			total={contacts.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			selection={{
				state: selection,
				actions: (
					<ContactsBulkActions
						ids={settledIds}
						onDone={selection.clear}
						archived={input.archived}
					/>
				),
				rowLabel: (row) => contactName(row),
			}}
			getRowId={(row) => row.id}
			loading={contacts.isFetching}
			onRowHover={(row) => prefetchRecord({ kind: "contact", id: row.id })}
			onRowClick={(row) => openRecord({ kind: "contact", id: row.id })}
			empty={
				input.archived
					? t("No archived contacts.")
					: t("No contacts match this view.")
			}
		/>
	);
}
