"use client";

import type { DealStage } from "@crm/db/enums";
import {
	Board,
	BoardCard,
	BoardColumn,
	BoardToolbar,
} from "@crm/ui/components/board";
import { Button } from "@crm/ui/components/button";
import {
	availableFacetsOf,
	type DataTableFacet,
	FacetFilterMenu,
} from "@crm/ui/components/data-table";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { Loader } from "@crm/ui/components/loader";
import { MonoLabel, Status } from "@crm/ui/components/mark";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { ListMoreMenu } from "@/components/data-table/list-more-menu";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	daysUntil,
	LocalComputed,
	LocalDateTime,
	LocalRelativeDate,
} from "@/components/local-date-time";
import { dealStageMark } from "@/lib/deal-stage";
import { useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { CreateDealHere } from "./create-deal-sheet";
import { dealsSearchParams } from "./deals-search-params";
import { DealsViewTabs } from "./deals-view-tabs";

type BoardData = RouterOutputs["deals"]["board"];
type Column = BoardData["columns"][number];
type Card = Column["deals"][number];

const BOARD_FILTERS = ["owner", "closing", "stage"] as const;

const CLOSE_DATE: Intl.DateTimeFormatOptions = {
	day: "numeric",
	month: "short",
};

export function DealsBoard() {
	const t = useT();
	const trpc = useTRPC();
	const { query, input } = useTableQuery(dealsSearchParams);
	const board = useQuery({
		...trpc.deals.board.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const stageLabel = useDealStageLabel();

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: t("Owner"),
			options: (users.data ?? []).map((user) => ({
				value: user.id,
				label: user.name,
			})),
		},
		{
			id: "closing",
			label: t("Closing"),
			options: CLOSING_OPTIONS.map((option) => ({
				value: option.value,
				label: t(option.label),
			})),
		},
	];
	const filtering = BOARD_FILTERS.some(
		(id) => (query.filters[id]?.length ?? 0) > 0,
	);

	return (
		<div className="flex flex-1 flex-col gap-4">
			<BoardToolbar>
				<DealsViewTabs />
				<div className="max-sm:order-last max-sm:w-full">
					<ListSearch placeholder={t("Deal or company")} />
				</div>
				<FacetFilterMenu
					facets={availableFacetsOf(facets, query.filters)}
					filters={query.filters}
					onChange={query.setFilter}
				/>
				{filtering ? (
					<Button variant="link" size="sm" onClick={query.reset}>
						{t("Reset filters")}
					</Button>
				) : null}
				<span className="ml-auto">
					<ListMoreMenu entity="deals" input={{ ...input, status: "open" }} />
				</span>
			</BoardToolbar>

			{board.data ? (
				<Board>
					{board.data.columns.map((column) => (
						<StageColumn
							key={column.stage}
							column={column}
							label={stageLabel(column.stage)}
							currency={board.data.reportingCurrency}
						/>
					))}
				</Board>
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
	const hidden = column.count - column.deals.length;

	return (
		<BoardColumn
			tone={dealStageMark(column.stage)}
			title={label}
			count={column.count}
			total={
				column.sumCents === null
					? null
					: formatMoney(column.sumCents, currency, locale)
			}
		>
			{column.deals.map((deal) => (
				<DealCard key={deal.id} deal={deal} />
			))}
			{hidden > 0 ? (
				<p className="px-1 text-muted-foreground text-xs">
					{t("{count} more", { count: hidden })}
				</p>
			) : null}
			<CreateDealHere stage={column.stage as DealStage} />
		</BoardColumn>
	);
}

function DealCard({ deal }: { deal: Card }) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();
	const prefetchRecord = usePrefetchRecord();
	const days = Math.max(0, -daysUntil(deal.stageChangedAt));

	return (
		<BoardCard
			title={deal.name}
			subtitle={
				<>
					<EntityLogo name={deal.company.name} size="sm" />
					<span className="truncate">{deal.company.name}</span>
				</>
			}
			amount={
				deal.amountCents === null
					? null
					: formatMoney(deal.amountCents, deal.currency, locale)
			}
			meta={
				<>
					<LocalComputed text={t("{days} d", { days })} />
					{deal.expectedCloseDate ? (
						<>
							{" · "}
							<LocalDateTime
								date={deal.expectedCloseDate}
								options={CLOSE_DATE}
							/>
						</>
					) : null}
				</>
			}
			onClick={() => openRecord({ kind: "deal", id: deal.id })}
			onMouseEnter={() => prefetchRecord({ kind: "deal", id: deal.id })}
			onFocus={() => prefetchRecord({ kind: "deal", id: deal.id })}
		/>
	);
}

function RecentlyClosed({ deals }: { deals: Card[] }) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();

	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t pt-4 text-2sm text-body-foreground">
			<MonoLabel>{t("Recently closed")}</MonoLabel>
			{deals.map((deal) => (
				<button
					key={deal.id}
					type="button"
					onClick={() => openRecord({ kind: "deal", id: deal.id })}
					className="min-w-0 max-w-full cursor-pointer text-left hover:text-foreground"
				>
					<Status tone={dealStageMark(deal.stage)}>
						{deal.name} · {deal.company.name}
						{deal.amountCents === null ? null : (
							<>
								{" · "}
								<span className="font-mono text-foreground tabular-nums">
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
					</Status>
				</button>
			))}
		</div>
	);
}
