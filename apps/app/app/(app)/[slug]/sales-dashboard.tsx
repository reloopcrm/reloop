"use client";

import {
	DashboardBlock,
	DashboardEmpty,
	DashboardRow,
	StackedBar,
	StatGroup,
} from "@crm/ui/components/dashboard";
import { ChartLegend, PairBarChart } from "@crm/ui/components/dashboard-chart";
import { Dot } from "@crm/ui/components/mark";
import { StatCard, type StatDelta } from "@crm/ui/components/stat-card";
import {
	formatMoney,
	formatMoneyCompact,
	formatPercent,
} from "@crm/ui/lib/format";
import Link from "next/link";
import { dealStageMark } from "@/lib/deal-stage";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat, numberFormat } from "@/lib/i18n/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Summary = RouterOutputs["dashboard"]["summary"];

function changeDelta(
	current: number,
	previous: number,
	label: string,
): StatDelta | undefined {
	if (previous === 0) return undefined;
	const change = Math.round(((current - previous) / previous) * 100);
	return { value: `${change >= 0 ? "+" : ""}${change}%`, label };
}

export function SalesDashboard({ summary }: { summary: Summary }) {
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();
	const stageLabel = useDealStageLabel();
	const locale = useLocale();

	const {
		pipeline,
		wonThisMonth,
		wonPrevMonth,
		performance,
		trend,
		closingThisMonthTotal,
		reportingCurrency,
		unconverted,
		winBack,
	} = summary;

	const money = (cents: number) =>
		formatMoneyCompact(cents, reportingCurrency, locale);
	const exact = (cents: number) =>
		formatMoney(cents, reportingCurrency, locale);
	const deals = (count: number) =>
		count === 1 ? t("{count} deal", { count }) : t("{count} deals", { count });
	const tally = (value: number) => numberFormat(locale).format(value);

	const hasTrend = trend.some((point) => point.won > 0 || point.created > 0);
	const wonLabel = t("Closed won");
	const createdLabel = t("New pipeline");
	const monthFormat = dateFormat(locale, { month: "short" });

	const trendBars = trend.map((point) => {
		const label = monthFormat.format(new Date(`${point.month}-01T12:00:00Z`));
		return {
			key: point.month,
			label,
			won: point.won,
			created: point.created,
			title: `${label} · ${wonLabel} ${exact(point.won)} · ${createdLabel} ${exact(point.created)}`,
		};
	});

	const stageSlices = pipeline.stages.flatMap((stage) =>
		stage.valueCents > 0 || stage.count > 0
			? [
					{
						key: stage.stage,
						label: stageLabel(stage.stage),
						count: stage.count,
						value: stage.valueCents,
						tone: dealStageMark(stage.stage),
					},
				]
			: [],
	);

	const wonDelta = changeDelta(
		wonThisMonth.valueCents,
		wonPrevMonth.valueCents,
		t("vs. last month"),
	);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-3">
				<StatGroup>
					<StatCard
						label={t("Closed won this month")}
						value={money(wonThisMonth.valueCents)}
						delta={wonDelta}
						description={
							wonDelta
								? deals(wonThisMonth.count)
								: t("{deals} · {amount} last month", {
										deals: deals(wonThisMonth.count),
										amount: money(wonPrevMonth.valueCents),
									})
						}
					/>
					<StatCard
						label={t("Open pipeline")}
						value={money(pipeline.totalCents)}
						description={t("{deals} in progress · {amount} due this month", {
							deals: deals(pipeline.totalDeals),
							amount: money(closingThisMonthTotal.valueCents),
						})}
					/>
					<StatCard
						label={t("Win rate ({days}d)", { days: performance.windowDays })}
						value={
							performance.winRate === null
								? "-"
								: formatPercent(performance.winRate, locale)
						}
						description={
							performance.wins + performance.losses === 0
								? t("Nothing has closed yet")
								: t("{wins} won · {losses} lost", {
										wins: performance.wins,
										losses: performance.losses,
									})
						}
					/>
					<StatCard
						label={t("Average deal ({days}d)", {
							days: performance.windowDays,
						})}
						value={
							performance.avgDealCents === null
								? "-"
								: money(performance.avgDealCents)
						}
						description={
							performance.avgCycleDays === null
								? t("No wins to measure")
								: t("{days}-day average cycle", {
										days: performance.avgCycleDays,
									})
						}
					/>
				</StatGroup>

				{unconverted.count > 0 ? (
					<p className="text-muted-foreground text-xs">
						{t("Every figure above is in {currency}.", {
							currency: reportingCurrency,
						})}{" "}
						{unconverted.count === 1
							? t(
									"{count} deal in {currencies} is not included. There is no rate to convert it with.",
									{
										count: unconverted.count,
										currencies: unconverted.currencies.join(", "),
									},
								)
							: t(
									"{count} deals in {currencies} are not included. There is no rate to convert them with.",
									{
										count: unconverted.count,
										currencies: unconverted.currencies.join(", "),
									},
								)}{" "}
						<Link
							href={workspaceUrl("/settings/currencies")}
							className="underline hover:no-underline"
						>
							{t("Set one")}
						</Link>
						.
					</p>
				) : null}
			</div>

			<DashboardRow>
				<DashboardBlock
					title={t("Closed won vs. new pipeline")}
					description={t(
						"Last six months, by the month a deal closed or was created",
					)}
					action={
						<ChartLegend
							items={[
								{ key: "won", label: wonLabel },
								{ key: "created", label: createdLabel },
							]}
						/>
					}
				>
					{hasTrend ? (
						<PairBarChart data={trendBars} />
					) : (
						<DashboardEmpty>
							{t("No deals closed or created yet")}
						</DashboardEmpty>
					)}
				</DashboardBlock>

				<DashboardBlock
					title={t("Open pipeline by stage")}
					description={t("Where the value sits right now")}
				>
					{stageSlices.length > 0 ? (
						<div className="flex flex-col border px-5 py-4">
							<StackedBar
								className="mb-3.5"
								segments={stageSlices.map((slice) => ({
									key: slice.key,
									share: pipeline.totalCents > 0 ? slice.value : slice.count,
									tone: slice.tone,
								}))}
							/>
							<ul className="flex flex-col">
								{stageSlices.map((slice) => (
									<li key={slice.key}>
										<Link
											href={`${workspaceUrl("/deals")}?stage=${slice.key}`}
											className="flex h-8.5 min-w-0 items-center gap-2.5 text-2sm hover:underline"
										>
											<Dot tone={slice.tone} />
											<span className="min-w-0 truncate">{slice.label}</span>
											<span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
												{slice.count}
											</span>
											<span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
												{exact(slice.value)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					) : (
						<DashboardEmpty>{t("Nothing open")}</DashboardEmpty>
					)}
				</DashboardBlock>
			</DashboardRow>

			{winBack ? (
				<DashboardBlock
					title={t("Won back this month")}
					description={t(
						"People you marked worth it in Win back, written to from a connected mailbox this month.",
					)}
				>
					<StatGroup columns={3}>
						<StatCard
							label={t("Contacted")}
							value={tally(winBack.contacted)}
							description={t("You wrote to them")}
						/>
						<StatCard
							label={t("Replied")}
							value={tally(winBack.answered)}
							description={t("They wrote back")}
						/>
						<StatCard
							label={t("Became a deal")}
							value={tally(winBack.deals)}
							description={
								winBack.deals === 0
									? t("No deal yet")
									: winBack.unconvertedDeals > 0
										? t(
												"{amount} in {currency} · {count} in another currency",
												{
													amount: money(winBack.dealValueCents),
													currency: reportingCurrency,
													count: tally(winBack.unconvertedDeals),
												},
											)
										: t("{amount} in new deals", {
												amount: money(winBack.dealValueCents),
											})
							}
						/>
					</StatGroup>
				</DashboardBlock>
			) : null}
		</div>
	);
}
