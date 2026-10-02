"use client";

import { DataTable, type DataTableFacet } from "@crm/ui/components/data-table";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	SignalIcon,
	TextIcon,
	VerdictIcon,
} from "@crm/ui/components/line-icons";
import { MonoLabel } from "@crm/ui/components/mark";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { RowOpenButton } from "@crm/ui/components/row-controls";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useTableSelection } from "@crm/ui/hooks/use-table-selection";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useMemo } from "react";
import { contactName } from "@/components/crm/contact-name";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { PotentialCell } from "@/components/crm/standing-cell";
import { ListSearch } from "@/components/data-table/list-search";
import {
	type LabeledColumn,
	useLocalizedColumns,
} from "@/components/data-table/localized-columns";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { DEMO } from "@/components/demo/demo-tour-config";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { numberFormat } from "@/lib/i18n/format";
import { POTENTIAL_FACET_OPTIONS } from "@/lib/record-standing";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { WinBackBulkVerdict } from "./win-back-bulk-verdict";
import { WIN_BACK_UI } from "./win-back-config";
import {
	winBackInput,
	winBackScopeParsers,
	winBackTable,
} from "./win-back-search-params";
import { factTitle, shortFact } from "./win-back-verdict";
import { WinBackVerdictMenu } from "./win-back-verdict-menu";

type List = RouterOutputs["reactivation"]["list"];
type Group = List["rows"][number];
type Person = Group["people"][number];

const COLUMNS: LabeledColumn<Group>[] = [
	{
		id: "name",
		header: "Company",
		icon: CompaniesIcon,
		sortable: true,
		hideable: false,
		cell: (row) => <GroupName row={row} />,
	},
	{
		id: "potential",
		header: "Potential",
		icon: SignalIcon,
		sortable: true,
		defaultHidden: true,
		size: 120,
		cell: (row) => <PotentialCell potential={row.potential} />,
	},
	{
		id: "business",
		header: "What happened",
		icon: TextIcon,
		size: 190,
		cell: (row) => <FactCell source={row} />,
	},
	{
		id: "people",
		header: "People",
		icon: ContactsIcon,
		sortable: true,
		defaultHidden: true,
		align: "right",
		size: 90,
		cell: (row) => <span className="tabular-nums">{row.people.length}</span>,
	},
	{
		id: "last",
		header: "Last contact",
		icon: DateIcon,
		sortable: true,
		size: 130,
		cell: (row) => <LocalRelativeTime date={row.lastContactAt} />,
	},
	{
		id: "verdict",
		header: "Verdict",
		icon: VerdictIcon,
		size: 150,
		control: true,
		cell: (row) => (
			<WinBackVerdictMenu
				name={row.name}
				contactIds={row.people.map((person) => person.id)}
				companyId={row.company?.id}
				verdict={row.feedback}
				mixed={row.people.some((person) => person.feedback !== null)}
			/>
		),
	},
];

function GroupName({ row }: { row: Group }) {
	const t = useT();
	const openRecord = useOpenRecord();
	const company = row.company;

	return (
		<span className="flex min-w-0 items-center gap-2.5">
			{company ? (
				<EntityLogo name={company.name} size="sm" />
			) : (
				<PersonAvatar
					src={row.people[0]?.imageUrl ?? null}
					name={row.name}
					email={row.people[0]?.email ?? null}
					size="sm"
				/>
			)}
			<span className="flex min-w-0 items-center gap-1.5">
				<span className="truncate font-medium">{row.name}</span>
				{company ? (
					<RowOpenButton
						aria-label={t("Open {name}", { name: company.name })}
						onClick={() => openRecord({ kind: "company", id: company.id })}
					/>
				) : null}
			</span>
		</span>
	);
}

function FactCell({
	source,
}: {
	source: { waitingOnUs: boolean; memory: Group["memory"] };
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const rules = useQuery(trpc.reactivation.rules.queryOptions());
	const unit = rules.data?.business.unit ?? "";

	return (
		<span className="block truncate" title={factTitle(source, t, locale, unit)}>
			{shortFact(source, t, locale, unit)}
		</span>
	);
}

function PersonCell({ person }: { person: Person }) {
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<PersonAvatar
				src={person.imageUrl}
				name={contactName(person)}
				email={person.email}
				size="sm"
			/>
			<span className="min-w-0 truncate">
				{contactName(person)}
				{person.title ? (
					<span className="text-muted-foreground">
						{" · "}
						{person.title}
					</span>
				) : null}
			</span>
		</span>
	);
}

function subCell(person: Person, columnId: string) {
	if (columnId === "name") return <PersonCell person={person} />;
	if (columnId === "potential") {
		return <PotentialCell potential={person.potential} />;
	}
	if (columnId === "business") return <FactCell source={person} />;
	if (columnId === "last") {
		return <LocalRelativeTime date={person.lastContactAt} />;
	}
	if (columnId === "verdict") {
		return (
			<WinBackVerdictMenu
				name={contactName(person)}
				contactIds={[person.id]}
				verdict={person.feedback}
			/>
		);
	}

	return null;
}

function GroupHeader({
	rows,
	bands,
	continued,
}: {
	rows: Group[];
	bands: List["bands"] | undefined;
	continued: List["continued"] | undefined;
}) {
	const t = useT();
	const locale = useLocale();
	const first = rows[0];
	const band = first ? bands?.[first.potential] : undefined;
	if (!first || !band) return null;
	const { companies, people } = band;
	const format = numberFormat(locale).format;

	return (
		<>
			<PotentialCell potential={first.potential} />
			<MonoLabel>
				{continued === first.potential ? `${t("Continued")} · ` : null}
				{companies === 1
					? t("1 company")
					: t("{count} companies", { count: format(companies) })}
				{" · "}
				{people === 1
					? t("1 person")
					: t("{count} people", { count: format(people) })}
			</MonoLabel>
		</>
	);
}

function ReadingProgress() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const progress = useQuery({
		...trpc.reactivation.progress.queryOptions(),
		refetchInterval: (query) =>
			(query.state.data?.pending ?? 0) > 0 ? 15_000 : 60_000,
	});

	const data = progress.data;
	if (!data || data.threads === 0) return null;

	const eta =
		data.etaMinutes === null
			? ""
			: data.etaMinutes < 60
				? t("about {count} min left", { count: data.etaMinutes })
				: t("about {count} h left", {
						count: Math.round(data.etaMinutes / 60),
					});
	const read = numberFormat(locale).format(data.read);
	const threads = numberFormat(locale).format(data.threads);
	const relevant = numberFormat(locale).format(data.relevant);

	return (
		<p className="text-muted-foreground text-xs">
			{data.pending > 0
				? `${t("Reading your mail in the background: {read} of {threads} conversations read, {relevant} about your business", { read, threads, relevant })}${eta ? `, ${eta}` : ""}${data.paused ? t(". Paused until the subscription limit resets.") : t(". Keeps running when you close this page.")}`
				: t(
						"{read} conversations read, {relevant} about your business. The list updates when new mail arrives.",
						{ read, relevant },
					)}
		</p>
	);
}

export function WinBackTable() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const table = useTableQuery(winBackTable);
	const [scope, setScope] = useQueryStates(winBackScopeParsers);

	const query = useQuery({
		...trpc.reactivation.list.queryOptions(winBackInput(table.input, scope)),
		placeholderData: (previous) => previous,
	});

	const rows = query.data?.rows ?? [];
	const selection = useTableSelection(
		useMemo(() => rows.map((row) => row.key), [rows]),
	);
	const selectedPeople = rows
		.filter((row) => selection.has(row.key))
		.flatMap((row) => row.people.map((person) => person.id));
	const facetCounts = query.data?.facetCounts;
	const people = query.data?.people ?? 0;
	const shown = rows.reduce((sum, row) => sum + row.people.length, 0);
	const columns = useLocalizedColumns(COLUMNS);
	const quietDays = WIN_BACK_UI.quickFilter.quietForDays;

	const facets: DataTableFacet[] = [
		{
			id: "potential",
			label: t("Potential"),
			options: POTENTIAL_FACET_OPTIONS.filter(
				(option) => (facetCounts?.potential?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
	];

	const setFilter = (next: { quiet?: number | null; rejected?: boolean }) => {
		void setScope(next);
		table.query.setPage(1);
	};

	return (
		<div
			className="flex min-h-0 flex-col gap-3"
			data-demo={DEMO.mark.winBackTable}
			data-demo-record={rows[0]?.people[0]?.id}
		>
			<DataTable
				query={table.query}
				search={<ListSearch placeholder={t("Search by company or person…")} />}
				onReset={() => setFilter({ quiet: null, rejected: false })}
				quickFilters={[
					{
						id: "quiet",
						label: t("Quiet for {count} days", {
							count: scope.quiet > 0 ? scope.quiet : quietDays,
						}),
						active: scope.quiet > 0,
						onToggle: () =>
							setFilter({ quiet: scope.quiet > 0 ? null : quietDays }),
					},
					{
						id: "rejected",
						label: t("Not for us"),
						active: scope.rejected,
						onToggle: () => setFilter({ rejected: !scope.rejected }),
					},
				]}
				leadingActions={
					<ToggleGroup
						type="single"
						size="sm"
						value={scope.scope}
						onValueChange={(value) => {
							if (value === "me" || value === "everyone") {
								void setScope({ scope: value });
								table.query.setPage(1);
							}
						}}
					>
						<ToggleGroupItem value="me">{t("Me")}</ToggleGroupItem>
						<ToggleGroupItem value="everyone">{t("Everyone")}</ToggleGroupItem>
					</ToggleGroup>
				}
				meta={
					<span className="flex items-center gap-2 text-2sm text-muted-foreground">
						{shown < people
							? t("{shown} of {total} people", {
									shown: numberFormat(locale).format(shown),
									total: numberFormat(locale).format(people),
								})
							: people === 1
								? t("1 person")
								: t("{count} people", {
										count: numberFormat(locale).format(people),
									})}
					</span>
				}
				columns={columns}
				rows={rows}
				total={query.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				groups={
					table.query.sort === "potential"
						? {
								keyOf: (row) => row.potential,
								header: (_key, groupRows) => (
									<GroupHeader
										rows={groupRows}
										bands={query.data?.bands}
										continued={query.data?.continued}
									/>
								),
							}
						: undefined
				}
				selection={{
					state: selection,
					actions: (
						<WinBackBulkVerdict
							contactIds={selectedPeople}
							onDone={selection.clear}
						/>
					),
					rowLabel: (row) => row.name,
				}}
				getRowId={(row) => row.key}
				loading={query.isFetching}
				expandable={{
					isExpandable: (row) => row.people.length > 0,
					getSubRows: (row) => row.people,
					getSubRowId: (person) => person.id,
					renderSubCell: (person, columnId) => subCell(person, columnId),
					onSubRowClick: (person) =>
						router.push(workspaceUrl(`/win-back/${person.id}`)),
					label: (row) => t("Show the people at {name}", { name: row.name }),
				}}
				empty={t("Nobody has gone quiet.")}
			/>
			<ReadingProgress />
		</div>
	);
}
