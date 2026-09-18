"use client";

import { DealStage } from "@crm/db/enums";

import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { formatMoney } from "@crm/ui/lib/format";
import { CompanyCell } from "@/components/crm/company-cell";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { OwnerCell } from "@/components/crm/owner-cell";
import { usePrefetchRecord } from "@/components/crm/record-sheet/record-prefetch";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalDay } from "@/components/local-date-time";
import type { DealListItem, DealListResult } from "@/lib/agent-transcript";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Locale, Translate } from "@/lib/i18n/locale";

const COLUMNS = [
	{ id: "deal", header: "Deal", width: "w-[20%]" },
	{ id: "company", header: "Company", width: "w-[18%]" },
	{ id: "stage", header: "Stage", width: "w-[18%]" },
	{
		id: "amount",
		header: "Amount",
		width: "w-[12%]",
		align: "right",
	},
	{ id: "owner", header: "Owner", width: "w-[14%]" },
	{ id: "close", header: "Close date", width: "w-[12%]" },
	{ id: "idle", header: "Idle", width: "w-[8%]", align: "right" },
] satisfies SimpleTableColumn[];

export function DealListResultTable({ result }: { result: DealListResult }) {
	const t = useT();
	const locale = useLocale();
	const openRecord = useOpenRecord();
	const prefetchRecord = usePrefetchRecord();
	const count = result.deals.length;
	const title = tableTitle(result, t);

	return (
		<section aria-label={title} className="flex w-full flex-col gap-3">
			<SimpleTable
				columns={COLUMNS.map((column) => ({
					...column,
					header: t(column.header),
				}))}
				className="min-w-[56rem] table-fixed [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"
				headerHeight="h-11"
			>
				{count === 0 ? (
					<SimpleTableRow>
						<TableCell
							colSpan={COLUMNS.length}
							className="h-32 whitespace-normal py-8 text-center align-middle text-muted-foreground"
						>
							{t("No deals met these pipeline filters.")}
						</TableCell>
					</SimpleTableRow>
				) : (
					result.deals.map((deal) => {
						const record = { kind: "deal" as const, id: deal.id };

						return (
							<SimpleTableRow
								key={deal.id}
								clickable
								onClick={() => openRecord(record)}
								onFocus={() => prefetchRecord(record)}
								onMouseEnter={() => prefetchRecord(record)}
							>
								<TableCell className="overflow-hidden px-3 py-3">
									<span className="block truncate font-medium">
										{deal.name}
									</span>
								</TableCell>
								<TableCell className="overflow-hidden px-3 py-3">
									<CompanyCell company={deal.company} />
								</TableCell>
								<TableCell className="overflow-hidden px-3 py-3">
									<Stage stage={deal.stage} />
								</TableCell>
								<TableCell className="overflow-hidden px-3 py-3 text-right">
									{deal.amount === null ? (
										<EmptyCellValue />
									) : (
										<span className="tabular-nums">
											{formatMoney(
												Math.round(deal.amount * 100),
												deal.currency,
												locale,
											)}
										</span>
									)}
								</TableCell>
								<TableCell className="overflow-hidden px-3 py-3">
									<OwnerCell owner={deal.owner} />
								</TableCell>
								<TableCell className="overflow-hidden px-3 py-3">
									{deal.expectedCloseDate ? (
										<span className="text-muted-foreground">
											<LocalDay date={deal.expectedCloseDate} />
										</span>
									) : (
										<EmptyCellValue />
									)}
								</TableCell>
								<TableCell
									className="overflow-hidden px-3 py-3 text-right text-muted-foreground tabular-nums"
									title={
										deal.neverActive
											? t("No activity has ever been recorded")
											: undefined
									}
								>
									{deal.daysSinceLastActivity}d
								</TableCell>
							</SimpleTableRow>
						);
					})
				)}
			</SimpleTable>
			<div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
				<span>{tableMeta(result, t, locale)}</span>
				<span>
					{t("As of")} <LocalDay date={result.asOf} />
				</span>
			</div>
		</section>
	);
}

function Stage({ stage }: { stage: string }) {
	return isDealStage(stage) ? (
		<DealStageIndicator stage={stage} />
	) : (
		<span className="text-muted-foreground">{stage}</span>
	);
}

function tableTitle(result: DealListResult, t: Translate): string {
	const count = result.deals.length;
	if (count === 0) return t("No matching deals");

	const stale = result.criteria.inactiveForDays !== null;
	const status =
		result.criteria.status === "all" ? null : result.criteria.status;
	const one = count === 1;

	if (stale && status) {
		return one
			? t("{count} stale {status} deal", { count, status })
			: t("{count} stale {status} deals", { count, status });
	}
	if (stale) {
		return one
			? t("{count} stale deal", { count })
			: t("{count} stale deals", { count });
	}
	if (status) {
		return one
			? t("{count} {status} deal", { count, status })
			: t("{count} {status} deals", { count, status });
	}
	return one ? t("{count} deal", { count }) : t("{count} deals", { count });
}

function tableMeta(
	result: DealListResult,
	t: Translate,
	locale: Locale,
): string {
	const count = result.deals.length;
	const details = [
		count === 1 ? t("{count} deal", { count }) : t("{count} deals", { count }),
		pipelineTotal(result.deals, t, locale),
		result.criteria.inactiveForDays === null
			? null
			: t("{days}+ days inactive", { days: result.criteria.inactiveForDays }),
		result.hasMore ? t("More results available") : null,
	].filter((detail): detail is string => Boolean(detail));

	return details.join(" · ");
}

function pipelineTotal(
	deals: readonly DealListItem[],
	t: Translate,
	locale: Locale,
): string | null {
	const currencies = new Set(deals.map((deal) => deal.currency));
	if (currencies.size !== 1) return null;

	const currency = currencies.values().next().value;
	if (!currency) return null;

	const amount = deals.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
	return t("{amount} pipeline", {
		amount: formatMoney(Math.round(amount * 100), currency, locale),
	});
}

function isDealStage(value: string): value is DealStage {
	return value in DealStage;
}
