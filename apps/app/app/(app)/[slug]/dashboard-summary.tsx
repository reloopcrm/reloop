"use client";

import {
	BlockTable,
	type BlockTableColumn,
} from "@crm/ui/components/block-table";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	DashboardBlock,
	DashboardEmpty,
	DashboardRow,
} from "@crm/ui/components/dashboard";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	DealsIcon,
	NumberIcon,
	SignalIcon,
	TaskIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { Loader } from "@crm/ui/components/loader";
import { Status } from "@crm/ui/components/mark";
import { formatMoneyCompact } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import {
	RecordLink,
	RecordPageLink,
} from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { contactName } from "@/components/crm/timeline/timeline-entry";
import {
	daysUntil,
	LocalComputed,
	LocalRelativeDate,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { dealStageMark } from "@/lib/deal-stage";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { OVERVIEW } from "./overview-config";
import { overviewParsers } from "./overview-search-params";
import { SalesDashboard } from "./sales-dashboard";
import { winBackTaskLink } from "./task-link";

type Summary = RouterOutputs["dashboard"]["summary"];
type OpenDeal = Summary["biggestOpen"][number];
type OverdueTask = Summary["overdueTasks"][number];
type ActivityEntry = Summary["recentActivity"][number];
type MyTask = RouterOutputs["activities"]["myTasks"][number];

const SIZE = {
	stage: 150,
	inStage: 90,
	value: 90,
	done: 44,
	due: 110,
	company: 180,
	who: 140,
	when: 110,
} as const;

export function DashboardSummary() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();
	const stageLabel = useDealStageLabel();

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

	const doneColumn = <
		TRow extends { id: string },
	>(): BlockTableColumn<TRow> => ({
		id: "done",
		header: "",
		size: SIZE.done,
		cell: (task) => (
			<Checkbox
				checked={false}
				disabled={complete.isPending}
				aria-label={t("Mark as done")}
				onCheckedChange={() =>
					complete.mutate({ id: task.id, completed: true })
				}
			/>
		),
	});

	const openColumns: BlockTableColumn<OpenDeal>[] = [
		{
			id: "deal",
			header: t("Deal"),
			icon: DealsIcon,
			cell: (deal) => (
				<span className="flex min-w-0 items-center gap-2">
					<EntityLogo
						src={deal.company.iconUrl}
						darkSrc={deal.company.iconDarkUrl}
						tone={deal.company.iconTone as EntityLogoTone | null | undefined}
						name={deal.company.name}
						size="sm"
					/>
					<span className="truncate">{deal.name}</span>
				</span>
			),
		},
		{
			id: "stage",
			header: t("Stage"),
			icon: SignalIcon,
			size: SIZE.stage,
			cell: (deal) => (
				<Status tone={dealStageMark(deal.stage)}>
					{stageLabel(deal.stage)}
				</Status>
			),
		},
		{
			id: "inStage",
			header: t("In stage"),
			icon: DateIcon,
			size: SIZE.inStage,
			cell: (deal) => (
				<LocalComputed
					text={t("{days} d", {
						days: Math.max(0, -daysUntil(deal.stageChangedAt)),
					})}
				/>
			),
		},
		{
			id: "value",
			header: t("Value"),
			icon: NumberIcon,
			size: SIZE.value,
			align: "right",
			cell: (deal) =>
				deal.amountCents === null ? (
					<EmptyCellValue />
				) : (
					formatMoneyCompact(deal.amountCents, deal.currency, locale)
				),
		},
	];

	const winBackPage = (task: OverdueTask | MyTask) => {
		const link = winBackTaskLink(task);
		return link ? (
			<RecordPageLink href={workspaceUrl(link.path)}>
				{contactName(link.contact)}
			</RecordPageLink>
		) : null;
	};

	const overdueColumns: BlockTableColumn<OverdueTask>[] = [
		{
			id: "task",
			header: t("Task"),
			icon: TaskIcon,
			cell: (task) => (
				<span className="flex min-w-0 flex-col">
					<span className="truncate">
						{task.subject ? t(task.subject) : null}
					</span>
					<span className="flex min-w-0 text-muted-foreground text-xs">
						{winBackPage(task) ??
							(task.deal ? (
								<RecordLink kind="deal" id={task.deal.id}>
									{task.deal.name}
								</RecordLink>
							) : task.company ? (
								<RecordLink kind="company" id={task.company.id}>
									{task.company.name}
								</RecordLink>
							) : null)}
					</span>
				</span>
			),
		},
		{
			id: "overdue",
			header: t("Overdue"),
			icon: DateIcon,
			size: SIZE.due,
			align: "right",
			cell: (task) =>
				task.dueAt ? <LocalRelativeDate date={task.dueAt} /> : t("No due date"),
		},
		doneColumn<OverdueTask>(),
	];

	const myTaskColumns: BlockTableColumn<MyTask>[] = [
		{
			id: "task",
			header: t("Task"),
			icon: TaskIcon,
			cell: (task) => (
				<span className="flex min-w-0 flex-col">
					<span className="truncate">
						{task.subject ? t(task.subject) : null}
					</span>
					<span className="flex min-w-0 text-muted-foreground text-xs">
						{winBackPage(task) ??
							(task.deal ? (
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
							) : null)}
					</span>
				</span>
			),
		},
		{
			id: "due",
			header: t("Due"),
			icon: DateIcon,
			size: SIZE.due,
			align: "right",
			cell: (task) =>
				task.dueAt ? (
					<LocalRelativeDate date={task.dueAt} />
				) : (
					<EmptyCellValue />
				),
		},
		doneColumn<MyTask>(),
	];

	const activityColumns: BlockTableColumn<ActivityEntry>[] = [
		{
			id: "activity",
			header: t("Activity"),
			icon: TextIcon,
			cell: (entry) => (
				<span className="truncate">
					{entry.subject ?? activityLabel(entry.type)}
				</span>
			),
		},
		{
			id: "company",
			header: t("Company"),
			icon: CompaniesIcon,
			size: SIZE.company,
			cell: (entry) =>
				entry.company ? (
					<RecordLink kind="company" id={entry.company.id}>
						{entry.company.name}
					</RecordLink>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "who",
			header: t("Who"),
			icon: ContactsIcon,
			size: SIZE.who,
			cell: (entry) => entry.createdBy.name,
		},
		{
			id: "when",
			header: t("When"),
			icon: DateIcon,
			size: SIZE.when,
			align: "right",
			cell: (entry) => <LocalRelativeTime date={entry.createdAt} />,
		},
	];

	return (
		<div className="flex flex-col gap-8">
			<SalesDashboard summary={summary} />

			<DashboardRow>
				<DashboardBlock
					title={t("Deals in progress")}
					description={t(
						"The largest open deals, and how long each has sat in its stage",
					)}
					action={
						<Button asChild variant="link">
							<Link href={workspaceUrl("/deals")}>{t("Open deals")}</Link>
						</Button>
					}
				>
					{biggestOpen.length === 0 ? (
						<DashboardEmpty>
							{t("Nothing open. Time to fill the pipeline.")}
						</DashboardEmpty>
					) : (
						<BlockTable
							columns={openColumns}
							rows={biggestOpen}
							getRowId={(deal) => deal.id}
							onRowClick={(deal) => openRecord({ kind: "deal", id: deal.id })}
						/>
					)}
				</DashboardBlock>

				<DashboardBlock
					title={t("Overdue tasks")}
					description={
						overdueTasks.length === 0
							? t("Every task you have logged is either done or still to come")
							: overdueTasks.length === 1
								? t("{count} task past due", { count: overdueTasks.length })
								: t("{count} tasks past due", { count: overdueTasks.length })
					}
				>
					{overdueTasks.length === 0 ? (
						<DashboardEmpty>{t("Nothing overdue. Good.")}</DashboardEmpty>
					) : (
						<BlockTable
							columns={overdueColumns}
							rows={overdueTasks}
							getRowId={(task) => task.id}
						/>
					)}
				</DashboardBlock>
			</DashboardRow>

			<DashboardBlock
				title={t("Your tasks")}
				description={t(
					"Open tasks from today on, the soonest first, the undated last",
				)}
			>
				{myTasks.length === 0 ? (
					<DashboardEmpty>{t("Nothing planned.")}</DashboardEmpty>
				) : (
					<BlockTable
						columns={myTaskColumns}
						rows={myTasks}
						getRowId={(task) => task.id}
					/>
				)}
			</DashboardBlock>

			<DashboardBlock
				title={mine ? t("Your recent activity") : t("Recent activity")}
				description={
					mine
						? t("Every note, task and stage change you have logged")
						: t("Every note, task and stage change across the workspace")
				}
				action={
					<Button asChild variant="link">
						<Link href={workspaceUrl("/companies")}>{t("All companies")}</Link>
					</Button>
				}
			>
				{recentActivity.length === 0 ? (
					<DashboardEmpty>{t("Nothing has happened yet.")}</DashboardEmpty>
				) : (
					<BlockTable
						columns={activityColumns}
						rows={recentActivity}
						getRowId={(entry) => entry.id}
					/>
				)}
			</DashboardBlock>
		</div>
	);
}
