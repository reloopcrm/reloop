"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { Checkbox } from "@crm/ui/components/checkbox";
import { DashboardRow } from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Loader } from "@crm/ui/components/loader";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatMoneyCompact } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { CSSProperties, ReactNode } from "react";
import { toast } from "sonner";
import { DealStageIndicator } from "@/components/crm/deal-stage";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { contactName } from "@/components/crm/timeline/timeline-entry";
import {
	LocalRelativeDate,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { dealStageColor } from "@/lib/deal-stage";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { OVERVIEW } from "./overview-config";
import { overviewParsers } from "./overview-search-params";
import { SalesDashboard } from "./sales-dashboard";

const CELL = "px-3 py-2.5 align-middle";

type TranslatableColumn = Omit<SimpleTableColumn, "header"> & {
	header?: string;
};

const OPEN_COLUMNS: TranslatableColumn[] = [
	{ id: "deal", header: "Deal" },
	{
		id: "stage",
		header: "Stage",
		width: "w-32",
		className: "hidden lg:table-cell",
	},
	{
		id: "share",
		srLabel: "Share of the largest",
		width: "w-24",
		className: "hidden sm:table-cell",
	},
	{ id: "value", header: "Value", width: "w-20", align: "right" },
];
const TASK_COLUMNS: TranslatableColumn[] = [
	{ id: "done", srLabel: "Done", width: "w-8" },
	{ id: "task", header: "Task" },
	{ id: "overdue", header: "Overdue", width: "w-24", align: "right" },
];
const MY_TASK_COLUMNS: TranslatableColumn[] = [
	{ id: "done", srLabel: "Done", width: "w-8" },
	{ id: "task", header: "Task" },
	{ id: "due", header: "Due", width: "w-24", align: "right" },
];
const ACTIVITY_COLUMNS: TranslatableColumn[] = [
	{ id: "activity", header: "Activity" },
	{
		id: "company",
		header: "Company",
		width: "w-44",
		className: "hidden md:table-cell",
	},
	{
		id: "deal",
		header: "Deal",
		width: "w-48",
		className: "hidden lg:table-cell",
	},
	{
		id: "who",
		header: "Who",
		width: "w-32",
		className: "hidden md:table-cell",
	},
	{ id: "when", header: "When", width: "w-20", align: "right" },
];

function localizeColumns(
	columns: TranslatableColumn[],
	t: Translate,
): SimpleTableColumn[] {
	return columns.map((column) => ({
		...column,
		header: column.header ? t(column.header) : column.header,
		srLabel: column.srLabel ? t(column.srLabel) : column.srLabel,
	}));
}

export function DashboardSummary() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();

	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	const summaryQuery = useQuery({
		...trpc.dashboard.summary.queryOptions({ scope }),
		placeholderData: (previous) => previous,
	});

	const myTasksQuery = useQuery(
		trpc.activities.myTasks.queryOptions(OVERVIEW.myTasks),
	);

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const summary = summaryQuery.data;

	if (!summary) {
		return (
			<div className="flex flex-1 justify-center py-12">
				<Loader />
			</div>
		);
	}

	const { biggestOpen, overdueTasks, recentActivity } = summary;
	const myTasks = myTasksQuery.data ?? [];

	const mine = scope === "me";
	const largestOpenCents = biggestOpen[0]?.baseAmountCents ?? 0;

	return (
		<div className="flex flex-col gap-6">
			<SalesDashboard summary={summary} />

			<DashboardRow split="even">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{t("Deals in progress")}</CardTitle>
						<CardDescription>
							{t(
								"The largest open deals, and how long each has sat in its stage",
							)}
						</CardDescription>
						<CardAction>
							<Button asChild variant="contrast" size="sm">
								<Link href={workspaceUrl("/deals")}>{t("Open deals")}</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{biggestOpen.length === 0 ? (
							<CardPanelEmpty>
								{t("Nothing open. Time to fill the pipeline.")}
							</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={localizeColumns(OPEN_COLUMNS, t)}
							>
								{biggestOpen.map((deal) => (
									<SimpleTableRow
										key={deal.id}
										clickable
										onClick={() => openRecord({ kind: "deal", id: deal.id })}
									>
										<TableCell className={CELL}>
											<DealCell
												name={deal.name}
												company={deal.company}
												meta={<LocalRelativeTime date={deal.stageChangedAt} />}
											/>
										</TableCell>
										<TableCell className={`${CELL} hidden lg:table-cell`}>
											<DealStageIndicator stage={deal.stage} />
										</TableCell>
										<TableCell className={`${CELL} hidden sm:table-cell`}>
											<ValueMeter
												share={
													largestOpenCents > 0
														? ((deal.baseAmountCents ?? 0) / largestOpenCents) *
															100
														: 0
												}
												color={dealStageColor(deal.stage)}
											/>
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{deal.amountCents === null ? (
												<EmptyCellValue />
											) : (
												formatMoneyCompact(
													deal.amountCents,
													deal.currency,
													locale,
												)
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{t("Overdue tasks")}</CardTitle>
						<CardDescription>
							{overdueTasks.length === 0
								? t(
										"Every task you have logged is either done or still to come",
									)
								: overdueTasks.length === 1
									? t("{count} task past due", { count: overdueTasks.length })
									: t("{count} tasks past due", {
											count: overdueTasks.length,
										})}
						</CardDescription>
					</CardHeader>
					<CardPanel>
						{overdueTasks.length === 0 ? (
							<CardPanelEmpty>{t("Nothing overdue. Good.")}</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={localizeColumns(TASK_COLUMNS, t)}
							>
								{overdueTasks.map((task) => (
									<SimpleTableRow key={task.id}>
										<TableCell className={CELL}>
											<Checkbox
												checked={false}
												disabled={complete.isPending}
												aria-label={t("Mark as done")}
												onCheckedChange={() =>
													complete.mutate({ id: task.id, completed: true })
												}
											/>
										</TableCell>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">
													{task.subject ? t(task.subject) : null}
												</span>
												<span className="flex min-w-0 text-muted-foreground">
													{task.deal ? (
														<RecordLink kind="deal" id={task.deal.id}>
															{task.deal.name}
														</RecordLink>
													) : task.company ? (
														<RecordLink kind="company" id={task.company.id}>
															{task.company.name}
														</RecordLink>
													) : null}
												</span>
											</span>
										</TableCell>
										<TableCell className={`${CELL} text-right`}>
											<StatusIndicator
												tone="error"
												label={
													task.dueAt ? (
														<LocalRelativeDate date={task.dueAt} />
													) : (
														t("No due date")
													)
												}
											/>
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>
			</DashboardRow>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>{t("Your tasks")}</CardTitle>
					<CardDescription>
						{t("Open tasks due today or later, the soonest first")}
					</CardDescription>
				</CardHeader>
				<CardPanel>
					{myTasks.length === 0 ? (
						<CardPanelEmpty>{t("Nothing due today or later.")}</CardPanelEmpty>
					) : (
						<SimpleTable
							variant="panel"
							surface="page"
							columns={localizeColumns(MY_TASK_COLUMNS, t)}
						>
							{myTasks.map((task) => (
								<SimpleTableRow key={task.id}>
									<TableCell className={CELL}>
										<Checkbox
											checked={false}
											disabled={complete.isPending}
											aria-label={t("Mark as done")}
											onCheckedChange={() =>
												complete.mutate({ id: task.id, completed: true })
											}
										/>
									</TableCell>
									<TableCell className={CELL}>
										<span className="flex min-w-0 flex-col">
											<span className="truncate">
												{task.subject ? t(task.subject) : null}
											</span>
											<span className="flex min-w-0 text-muted-foreground">
												{task.deal ? (
													<RecordLink kind="deal" id={task.deal.id}>
														{task.deal.name}
													</RecordLink>
												) : task.contact ? (
													<RecordLink kind="contact" id={task.contact.id}>
														{contactName(task.contact)}
													</RecordLink>
												) : task.company ? (
													<RecordLink kind="company" id={task.company.id}>
														{task.company.name}
													</RecordLink>
												) : null}
											</span>
										</span>
									</TableCell>
									<TableCell
										className={`${CELL} text-right text-muted-foreground`}
									>
										{task.dueAt ? (
											<LocalRelativeDate date={task.dueAt} />
										) : null}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</CardPanel>
			</Card>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>
						{mine ? t("Your recent activity") : t("Recent activity")}
					</CardTitle>
					<CardDescription>
						{mine
							? t("Every note, task and stage change you have logged")
							: t("Every note, task and stage change across the workspace")}
					</CardDescription>
					<CardAction>
						<Button asChild variant="contrast" size="sm">
							<Link href={workspaceUrl("/companies")}>
								{t("All companies")}
							</Link>
						</Button>
					</CardAction>
				</CardHeader>
				{recentActivity.length === 0 ? (
					<CardTableEmpty>{t("Nothing has happened yet.")}</CardTableEmpty>
				) : (
					<SimpleTable columns={localizeColumns(ACTIVITY_COLUMNS, t)}>
						{recentActivity.map((entry) => (
							<SimpleTableRow key={entry.id}>
								<TableCell className={CELL}>
									<span className="truncate">
										{entry.subject ?? activityLabel(entry.type)}
									</span>
								</TableCell>
								<TableCell className={`${CELL} hidden md:table-cell`}>
									{entry.company ? (
										<RecordLink kind="company" id={entry.company.id}>
											{entry.company.name}
										</RecordLink>
									) : (
										<EmptyCellValue />
									)}
								</TableCell>
								<TableCell className={`${CELL} hidden lg:table-cell`}>
									{entry.deal ? (
										<RecordLink kind="deal" id={entry.deal.id}>
											{entry.deal.name}
										</RecordLink>
									) : (
										<EmptyCellValue />
									)}
								</TableCell>
								<TableCell
									className={`${CELL} hidden truncate text-muted-foreground md:table-cell`}
								>
									{entry.createdBy.name}
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									<LocalRelativeTime date={entry.createdAt} />
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}

function DealCell({
	name,
	company,
	meta,
}: {
	name: string;
	company: {
		name: string;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
	};
	meta?: ReactNode;
}) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<EntityLogo
				src={company.iconUrl}
				darkSrc={company.iconDarkUrl}
				tone={company.iconTone as EntityLogoTone | null | undefined}
				name={company.name}
				size="sm"
			/>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium">{name}</span>
				<span className="truncate text-muted-foreground">
					{meta ? (
						<>
							{company.name} · {meta}
						</>
					) : (
						company.name
					)}
				</span>
			</span>
		</span>
	);
}

function ValueMeter({ share, color }: { share: number; color: string }) {
	return (
		<span
			className="bloom-low flex h-1.5 w-full overflow-hidden bg-muted"
			style={{ "--bloom-color": color } as CSSProperties}
		>
			<span
				className="h-full w-(--share)"
				style={
					{
						backgroundColor: color,
						"--share": `${Math.round(Math.max(Math.min(share, 100), 0))}%`,
					} as CSSProperties
				}
			/>
		</span>
	);
}
