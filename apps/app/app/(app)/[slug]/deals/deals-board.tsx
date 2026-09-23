"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	availableFacetsOf,
	type DataTableFacet,
	FacetFilterMenu,
} from "@crm/ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { Loader } from "@crm/ui/components/loader";
import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ExportButton } from "@/components/data-table/export-button";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	daysUntil,
	LocalComputed,
	LocalDateTime,
	LocalRelativeDate,
} from "@/components/local-date-time";
import { dealStagePresentation } from "@/lib/deal-stage";
import { useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { CreateDealHere } from "./create-deal-sheet";
import { dealsSearchParams } from "./deals-search-params";
import { DealsViewTabs } from "./deals-view-tabs";

type Board = RouterOutputs["deals"]["board"];
type Column = Board["columns"][number];
type Card = Column["deals"][number];

const CLOSE_DATE: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "short",
};

const ALL_OWNERS = "all";

function useDealsBoard() {
	const trpc = useTRPC();
	const table = useTableQuery(dealsSearchParams);
	const board = useQuery({
		...trpc.deals.board.queryOptions(table.input),
		placeholderData: (previous) => previous,
	});
	return { table, board };
}

export function DealsBoard() {
	const t = useT();
	const trpc = useTRPC();
	const { table, board } = useDealsBoard();
	const { query, input } = table;
	const users = useQuery(trpc.users.list.queryOptions());
	const stageLabel = useDealStageLabel();

	const facets: DataTableFacet[] = [
		{
			id: "closing",
			label: t("Closing"),
			options: CLOSING_OPTIONS.map((option) => ({
				value: option.value,
				label: t(option.label),
			})),
		},
	];
	const owner = query.filters.owner?.[0] ?? ALL_OWNERS;
	const ownerLabel =
		users.data?.find((user) => user.id === owner)?.name ?? t("All owners");

	return (
		<div className="flex flex-1 flex-col gap-5">
			<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
				<DealsViewTabs />
				<ListSearch placeholder={t("Deal or company")} />
				<FacetFilterMenu
					facets={availableFacetsOf(facets, query.filters)}
					filters={query.filters}
					onChange={query.setFilter}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" align="toolbar">
							<Icon icon={ChevronDown} data-icon="inline-start" />
							<span className="truncate">{ownerLabel}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="min-w-48">
						<DropdownMenuRadioGroup
							value={owner}
							onValueChange={(value) =>
								query.setFilter("owner", value === ALL_OWNERS ? [] : [value])
							}
						>
							<DropdownMenuRadioItem value={ALL_OWNERS}>
								{t("All owners")}
							</DropdownMenuRadioItem>
							{(users.data ?? []).map((user) => (
								<DropdownMenuRadioItem key={user.id} value={user.id}>
									{user.name}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<span className="sm:ml-auto">
					<ExportButton
						entity="deals"
						input={{ ...input, status: "open" }}
						variant="link"
					/>
				</span>
			</div>

			{board.data ? (
				<div className="grid flex-1 grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
					{board.data.columns.map((column) => (
						<StageColumn
							key={column.stage}
							column={column}
							label={stageLabel(column.stage)}
							currency={board.data.reportingCurrency}
						/>
					))}
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center py-12">
					<Loader />
				</div>
			)}

			{board.data && board.data.recentClosed.length > 0 ? (
				<RecentlyClosed deals={board.data.recentClosed} />
			) : null}
		</div>
	);
}

function StageColumn({
	column,
	label,
	currency,
}: {
	column: Column;
	label: string;
	currency: string;
}) {
	const t = useT();
	const locale = useLocale();
	const { tone } = dealStagePresentation(column.stage);
	const hidden = column.count - column.deals.length;

	return (
		<section className="flex min-w-0 flex-col gap-2.5">
			<div className="flex items-center gap-2 border-b px-1 pb-2">
				<IndicatorDot
					tone={tone}
					aria-hidden="true"
					className="size-2 rounded-full"
				/>
				<span className="truncate font-medium text-foreground">{label}</span>
				<span className="text-muted-foreground text-xs tabular-nums">
					{column.count}
				</span>
				<span className="ml-auto text-2sm text-body-foreground tabular-nums">
					{column.sumCents === null
						? null
						: formatMoney(column.sumCents, currency, locale)}
				</span>
			</div>
			{column.deals.map((deal) => (
				<DealCard key={deal.id} deal={deal} />
			))}
			{hidden > 0 ? (
				<p className="px-1 text-muted-foreground text-xs">
					{t("{count} more", { count: hidden })}
				</p>
			) : null}
			<CreateDealHere stage={column.stage as DealStage} />
		</section>
	);
}

function DealCard({ deal }: { deal: Card }) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();
	const prefetchRecord = usePrefetchRecord();
	const days = Math.max(0, -daysUntil(deal.stageChangedAt));

	return (
		<button
			type="button"
			onClick={() => openRecord({ kind: "deal", id: deal.id })}
			onMouseEnter={() => prefetchRecord({ kind: "deal", id: deal.id })}
			onFocus={() => prefetchRecord({ kind: "deal", id: deal.id })}
			className="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
		>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-medium text-foreground">
					{deal.name}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{deal.company.name}
				</span>
			</span>
			<span className="flex items-baseline justify-between gap-2">
				<span className="font-semibold text-foreground text-md tabular-nums">
					{deal.amountCents === null
						? null
						: formatMoney(deal.amountCents, deal.currency, locale)}
				</span>
				<span className="truncate text-muted-foreground text-xs tabular-nums">
					<LocalComputed text={t("{days} d in stage", { days })} />
					{deal.expectedCloseDate ? (
						<>
							{" · "}
							<LocalDateTime
								date={deal.expectedCloseDate}
								options={CLOSE_DATE}
							/>
						</>
					) : null}
				</span>
			</span>
		</button>
	);
}

function RecentlyClosed({ deals }: { deals: Card[] }) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();

	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-2sm text-muted-foreground">
			<span className="font-medium text-body-foreground">
				{t("Recently closed")}
			</span>
			{deals.map((deal) => (
				<button
					key={deal.id}
					type="button"
					onClick={() => openRecord({ kind: "deal", id: deal.id })}
					className="inline-flex min-w-0 items-center gap-1.5 truncate hover:text-foreground"
				>
					<IndicatorDot
						tone={deal.stage === "CLOSED_WON" ? "success" : "error"}
						aria-hidden="true"
						className="size-2 rounded-full"
					/>
					<span className="truncate">
						{deal.name} · {deal.company.name}
						{deal.amountCents === null ? null : (
							<>
								{" · "}
								<span className="text-foreground tabular-nums">
									{formatMoney(deal.amountCents, deal.currency, locale)}
								</span>
							</>
						)}
						{deal.closedAt ? (
							<>
								{" · "}
								<LocalRelativeDate date={deal.closedAt} />
							</>
						) : null}
					</span>
				</button>
			))}
		</div>
	);
}
