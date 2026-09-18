"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { ChartConfig } from "@crm/ui/components/chart";
import { DashboardRow, StatGroup } from "@crm/ui/components/dashboard";
import { StatCard, type StatDelta } from "@crm/ui/components/stat-card";
import {
	formatMoney,
	formatMoneyCompact,
	formatPercent,
} from "@crm/ui/lib/format";
import Link from "next/link";
import type { ReactNode } from "react";
import { AreaTrend, DonutStat } from "@/components/dashboard-charts";
import { dealStageColor } from "@/lib/deal-stage";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat, numberFormat } from "@/lib/i18n/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Summary = RouterOutputs["dashboard"]["summary"];

const TREND_CONFIG = {
	won: { label: "Closed won", color: "var(--chart-3)" },
	created: { label: "New pipeline", color: "var(--chart-1)" },
} as const;

function changeDelta(
	current: number,
	previous: number,
	label: string,
): StatDelta | undefined {
	if (previous === 0) return undefined;
	const change = Math.round(((current - previous) / previous) * 100);
	return {
		value: `${change >= 0 ? "+" : ""}${change}%`,
		direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
		label,
	};
}

export function SalesDashboard({ summary }: { summary: Summary }) {
	const workspaceUrl = useWorkspaceUrl();
	const t = useT();
	const stageLabel = useDealStageLabel();
	const locale = useLocale();
	const trendConfig: ChartConfig = {
		won: { label: t(TREND_CONFIG.won.label), color: TREND_CONFIG.won.color },
		created: {
			label: t(TREND_CONFIG.created.label),
			color: TREND_CONFIG.created.color,
		},
	};

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
	const exact = (value: number | string) =>
		formatMoney(Number(value), reportingCurrency, locale);
	const deals = (count: number) =>
		count === 1 ? t("{count} deal", { count }) : t("{count} deals", { count });
	const tally = (value: number) => numberFormat(locale).format(value);

	const hasTrend = trend.some((point) => point.won > 0 || point.created > 0);

	const trendPoints = trend.map((point) => ({
		...point,
		month: dateFormat(locale, { month: "short" }).format(
			new Date(`${point.month}-01T12:00:00Z`),
		),
	}));

	const stageSlices = pipeline.stages.flatMap((stage) =>
		stage.valueCents > 0
			? [
					{
						key: stage.stage,
						label: stageLabel(stage.stage),
						value: stage.valueCents,
						color: dealStageColor(stage.stage),
						count: stage.count,
					},
				]
			: [],
	);

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label={t("Closed won this month")}
					value={money(wonThisMonth.valueCents)}
					delta={changeDelta(
						wonThisMonth.valueCents,
						wonPrevMonth.valueCents,
						t("vs. last month"),
					)}
					description={t("{deals} · {amount} last month", {
						deals: deals(wonThisMonth.count),
						amount: money(wonPrevMonth.valueCents),
					})}
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
					label={t("Average deal ({days}d)", { days: performance.windowDays })}
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

			{winBack ? (
				<Card>
					<CardHeader>
						<CardTitle>{t("Won back this month")}</CardTitle>
						<CardDescription>
							{t(
								"People you marked worth it in Win back, written to from a connected mailbox this month.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-3 gap-6">
							<WinBackFigure
								label={t("Contacted")}
								value={tally(winBack.contacted)}
								note={t("You wrote to them")}
							/>
							<WinBackFigure
								label={t("Replied")}
								value={tally(winBack.answered)}
								note={t("They wrote back")}
							/>
							<WinBackFigure
								label={t("Became a deal")}
								value={tally(winBack.deals)}
								note={
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
						</div>
					</CardContent>
				</Card>
			) : null}

			<DashboardRow split="hero">
				<ChartPanel
					title={t("Closed won vs. new pipeline")}
					description={t(
						"Last six months, by the month a deal closed or was created",
					)}
				>
					{hasTrend ? (
						<div className="flex flex-1 flex-col justify-center py-4">
							<AreaTrend
								data={trendPoints}
								config={trendConfig}
								xKey="month"
								height={196}
								variant="gradient"
								bloom="high"
								showLegend
								formatValue={exact}
							/>
						</div>
					) : (
						<EmptyChart label={t("No deals closed or created yet")} />
					)}
				</ChartPanel>

				<ChartPanel
					title={t("Open pipeline by stage")}
					description={t("Where the value sits right now")}
				>
					{stageSlices.length > 0 ? (
						<div className="flex flex-1 flex-col justify-between gap-1 pt-4">
							<DonutStat
								data={stageSlices}
								height={168}
								centerValue={money(pipeline.totalCents)}
								centerLabel={t("open")}
								formatValue={exact}
							/>
							<ul className="flex flex-col px-5 pb-1 md:px-6">
								{stageSlices.map((slice) => (
									<li key={slice.key} className="border-t first:border-t-0">
										<Link
											href={`${workspaceUrl("/deals")}?stage=${slice.key}`}
											className="flex items-center gap-2.5 py-2 text-xs hover:underline"
										>
											<span
												aria-hidden
												className="size-1.5 shrink-0"
												style={{ backgroundColor: slice.color }}
											/>
											<span className="min-w-0 flex-1 truncate">
												{slice.label}
											</span>
											<span className="shrink-0 text-muted-foreground tabular-nums">
												{slice.count}
											</span>
											<span className="w-14 shrink-0 text-right font-medium tabular-nums">
												{money(slice.value)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					) : (
						<EmptyChart label={t("Nothing open")} />
					)}
				</ChartPanel>
			</DashboardRow>
		</div>
	);
}

function WinBackFigure({
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-medium text-2xl tabular-nums">{value}</span>
			<span className="text-muted-foreground text-xs">{note}</span>
		</div>
	);
}

function ChartPanel({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<div className="flex flex-1 flex-col border">{children}</div>
		</Card>
	);
}

function EmptyChart({ label }: { label: string }) {
	return (
		<div className="flex flex-1 items-center justify-center px-5 py-10 text-muted-foreground text-sm md:px-6">
			{label}
		</div>
	);
}
