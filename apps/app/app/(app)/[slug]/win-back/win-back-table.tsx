"use client";

import Undo from "@carbon/icons-react/es/Undo";
import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableFacet } from "@crm/ui/components/data-table";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { contactName } from "@/components/crm/contact-name";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { PotentialCell } from "@/components/crm/standing-cell";
import { ListSearch } from "@/components/data-table/list-search";
import {
	type LabeledColumn,
	useLocalizedColumns,
} from "@/components/data-table/localized-columns";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { numberFormat } from "@/lib/i18n/format";
import { POTENTIAL_FACET_OPTIONS } from "@/lib/record-standing";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { WinBackRulesSheet } from "./win-back-rules-sheet";
import {
	winBackInput,
	winBackScopeParsers,
	winBackTable,
} from "./win-back-search-params";
import { factTitle, shortFact } from "./win-back-verdict";
import { WinBackVerdictMenu } from "./win-back-verdict-menu";

type Group = RouterOutputs["reactivation"]["list"]["rows"][number];
type Person = Group["people"][number];

const COLUMNS: LabeledColumn<Group>[] = [
	{
		id: "name",
		header: "Company",
		sortable: true,
		hideable: false,
		width: "w-[30%]",
		cell: (row) => <GroupName row={row} />,
	},
	{
		id: "potential",
		header: "Potential",
		sortable: true,
		width: "w-[10%]",
		cell: (row) => <PotentialCell potential={row.potential} />,
	},
	{
		id: "business",
		header: "What happened",
		width: "w-[26%]",
		hideBelow: "md",
		cell: (row) => <FactCell source={row} />,
	},
	{
		id: "people",
		header: "People",
		sortable: true,
		width: "w-[10%]",
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground tabular-nums">
				{row.people.length}
			</span>
		),
	},
	{
		id: "last",
		header: "Last contact",
		sortable: true,
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) => (
			<span className="text-muted-foreground">
				<LocalRelativeTime date={row.lastContactAt} />
			</span>
		),
	},
	{
		id: "verdict",
		header: "Verdict",
		align: "right",
		width: "w-[12%]",
		hideable: false,
		cell: (row) => (
			<WinBackVerdictMenu
				name={row.name}
				contactIds={row.people.map((person) => person.id)}
				verdict={row.feedback}
				mixed={row.people.some((person) => person.feedback !== null)}
			/>
		),
	},
];

function GroupName({ row }: { row: Group }) {
	const t = useT();
	const people = row.people.length;

	return (
		<span className="flex min-w-0 items-center gap-2.5">
			{row.company ? (
				<EntityLogo name={row.company.name} size="sm" />
			) : (
				<PersonAvatar
					src={row.people[0]?.imageUrl ?? null}
					name={row.name}
					email={row.people[0]?.email ?? null}
					size="sm"
				/>
			)}
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{row.name}</span>
				<span className="truncate text-muted-foreground text-xs">
					{people === 1
						? (row.people[0]?.title ?? row.people[0]?.email ?? "")
						: t("{count} people", { count: people })}
				</span>
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

	return (
		<span
			className="block truncate text-sm"
			title={factTitle(source, t, locale)}
		>
			{shortFact(source, t, locale)}
		</span>
	);
}

function PersonCell({ person }: { person: Person }) {
	return (
		<span className="flex min-w-0 items-center gap-2.5 pl-4">
			<PersonAvatar
				src={person.imageUrl}
				name={contactName(person)}
				email={person.email}
				size="sm"
			/>
			<span className="flex min-w-0 flex-col">
				<span className="truncate">{contactName(person)}</span>
				<span className="truncate text-muted-foreground text-xs">
					{person.title ?? person.email ?? ""}
				</span>
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
		return (
			<span className="text-muted-foreground">
				<LocalRelativeTime date={person.lastContactAt} />
			</span>
		);
	}
	if (columnId === "verdict") {
		return (
			<WinBackVerdictMenu
				name={contactName(person)}
				contactIds={[person.id]}
				verdict={person.feedback}
				size="xs"
			/>
		);
	}

	return null;
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
		<p className="text-muted-foreground text-sm">
			{data.pending > 0
				? `${t("Reading your mail in the background: {read} of {threads} conversations read, {relevant} about your business", { read, threads, relevant })}${eta ? `, ${eta}` : ""}${data.paused ? t(". Paused until the subscription limit resets.") : t(". Keeps running when you close this page.")}`
				: t("{read} conversations read, {relevant} about your business.", {
						read,
						relevant,
					})}
		</p>
	);
}

export function WinBackTable() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const table = useTableQuery(winBackTable);
	const [scope, setScope] = useQueryStates(winBackScopeParsers);

	const query = useQuery({
		...trpc.reactivation.list.queryOptions(winBackInput(table.input, scope)),
		placeholderData: (previous) => previous,
	});

	const rows = query.data?.rows ?? [];
	const facetCounts = query.data?.facetCounts;
	const people = query.data?.people ?? 0;
	const columns = useLocalizedColumns(COLUMNS);

	const facets: DataTableFacet[] = [
		{
			id: "potential",
			label: t("Potential"),
			options: POTENTIAL_FACET_OPTIONS.filter(
				(option) => (facetCounts?.potential?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: t(option.label) })),
		},
	];

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<ReadingProgress />
			<DataTable
				query={table.query}
				search={<ListSearch placeholder={t("Search by company or person…")} />}
				leadingActions={
					<div className="flex items-center gap-2">
						<ToggleGroup
							type="single"
							value={scope.scope}
							onValueChange={(value) => {
								if (value === "me" || value === "everyone") {
									void setScope({ scope: value });
									table.query.setPage(1);
								}
							}}
						>
							<ToggleGroupItem value="me">{t("Me")}</ToggleGroupItem>
							<ToggleGroupItem value="everyone">
								{t("Everyone")}
							</ToggleGroupItem>
						</ToggleGroup>
						<Button
							variant={scope.rejected ? "secondary" : "outline"}
							size="sm"
							onClick={() => {
								void setScope({ rejected: !scope.rejected });
								table.query.setPage(1);
							}}
						>
							<Icon icon={Undo} data-icon="inline-start" />
							{t("Not for us")}
						</Button>
					</div>
				}
				actions={
					query.data ? <WinBackRulesSheet rules={query.data.rules} /> : null
				}
				meta={
					<span className="flex items-center gap-2 text-muted-foreground text-sm">
						{people === 1
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
				getRowId={(row) => row.key}
				loading={query.isFetching}
				expandable={{
					isExpandable: (row) => row.people.length > 1,
					getSubRows: (row) => row.people,
					getSubRowId: (person) => person.id,
					renderSubCell: (person, columnId) => subCell(person, columnId),
					onSubRowClick: (person) =>
						openRecord({ kind: "contact", id: person.id }),
				}}
				onRowClick={(row) => {
					const first = row.people[0];
					if (row.people.length > 1 || !first) return;
					openRecord({ kind: "contact", id: first.id });
				}}
				empty={t("Nobody has gone quiet.")}
			/>
		</div>
	);
}
