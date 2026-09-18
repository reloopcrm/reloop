"use client";

import { DealStage } from "@crm/db/enums";
import { Checkbox } from "@crm/ui/components/checkbox";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import {
	daysUntil,
	LocalDateTime,
	LocalRelativeDate,
} from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { ActivityIcon } from "./activity-icon";
import { MeetingEntry } from "./meeting-entry";
import type { TimelineAnchor } from "./timeline";
import { TIMELINE } from "./timeline-config";

export type TimelineEntryData =
	RouterOutputs["activities"]["timeline"]["entries"][number];

const stageChange = z
	.object({ from: z.enum(DealStage), to: z.enum(DealStage) })
	.nullable()
	.catch(null);

function anchorId(anchor: TimelineAnchor): string {
	if ("companyId" in anchor) return anchor.companyId;
	if ("contactId" in anchor) return anchor.contactId;
	return anchor.dealId;
}

export function contactName(
	contact: { firstName: string; lastName: string | null } | null,
): string | null {
	if (!contact) return null;
	const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
	return name.length > 0 ? name : null;
}

export function Row({
	marker,
	indent = false,
	className,
	children,
}: {
	marker: ReactNode;
	indent?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<article
			className={cn(
				"relative flex flex-col gap-1 py-1",
				indent ? "pl-12" : "pl-8",
				className,
			)}
		>
			<span className="absolute top-1.5 left-1 flex size-4 items-center justify-center bg-popover text-muted-foreground">
				{marker}
			</span>
			{children}
		</article>
	);
}

export function Meta({
	lead,
	tone = "who",
	detail,
	time,
}: {
	lead: ReactNode;
	tone?: "who" | "kind";
	detail?: ReactNode;
	time: ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-baseline gap-2">
			<span
				className={cn(
					"shrink-0",
					tone === "who" ? "font-medium" : "text-muted-foreground",
				)}
			>
				{lead}
			</span>
			{detail ? (
				<span className="min-w-0 flex-1 truncate text-muted-foreground">
					{detail}
				</span>
			) : null}
			<span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
				{time}
			</span>
		</div>
	);
}

export function RecordLinks({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const here = anchorId(anchor);
	const deal = entry.deal && entry.deal.id !== here ? entry.deal : null;
	const contact =
		entry.contact && entry.contact.id !== here ? entry.contact : null;

	return (
		<>
			{deal ? (
				<RecordLink kind="deal" id={deal.id}>
					{deal.name}
				</RecordLink>
			) : null}
			{contact ? (
				<RecordLink kind="contact" id={contact.id}>
					{contactName(contact)}
				</RecordLink>
			) : null}
		</>
	);
}

export function TimelineEntry({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const t = useT();
	const stageLabel = useDealStageLabel();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const isTask = entry.type === "TASK";
	const isMeeting = entry.type === "MEETING";
	const done = entry.completedAt !== null;
	const dueAt = isTask && !done ? entry.dueAt : null;
	const dueInDays = dueAt === null ? 0 : daysUntil(dueAt);
	const overdue = dueInDays < 0;

	const change =
		entry.type === "STAGE_CHANGE" ? stageChange.parse(entry.meta) : null;
	const when = entry.occurredAt ?? entry.createdAt;
	const synced = entry.meta?.synced === true;

	const body = entry.body
		? t(entry.body, {
				email: String(entry.meta?.email ?? ""),
				domain: String(entry.meta?.domain ?? ""),
			})
		: null;

	const headline = change
		? `${stageLabel(change.from)} → ${stageLabel(change.to)}`
		: entry.subject
			? t(entry.subject)
			: entry.subject;

	const kind = t(activityLabel(entry.type));
	const byKind = isTask || isMeeting;
	const detail = isTask
		? t("created by {name}", { name: entry.createdBy.name })
		: isMeeting
			? synced
				? t("via Calendar")
				: entry.createdBy.name
			: kind;

	return (
		<Row
			marker={
				isTask ? (
					<Checkbox
						checked={done}
						disabled={complete.isPending}
						aria-label={done ? t("Mark as not done") : t("Mark as done")}
						onCheckedChange={(checked) =>
							complete.mutate({ id: entry.id, completed: checked === true })
						}
					/>
				) : (
					<span role="img" aria-label={kind}>
						<ActivityIcon type={entry.type} />
					</span>
				)
			}
		>
			<Meta
				lead={byKind ? kind : entry.createdBy.name}
				tone={byKind ? "kind" : "who"}
				detail={detail}
				time={
					dueAt ? (
						<LocalDateTime date={dueAt} options={TIMELINE.format.day} />
					) : (
						<LocalDateTime date={when} options={TIMELINE.format.time} />
					)
				}
			/>

			{headline ? (
				<p
					className={cn(
						"wrap-anywhere font-medium",
						done && "text-muted-foreground line-through",
					)}
				>
					{t(headline)}
				</p>
			) : null}

			{body ? (
				<p
					className={cn(
						"text-pretty wrap-anywhere",
						headline
							? "line-clamp-2 text-muted-foreground"
							: "whitespace-pre-wrap text-body-foreground",
					)}
				>
					{body}
				</p>
			) : null}

			{entry.calendarEvent ? (
				<MeetingEntry
					eventId={entry.calendarEvent.id}
					startsAt={entry.calendarEvent.startsAt}
					endsAt={entry.calendarEvent.endsAt}
					isAllDay={entry.calendarEvent.isAllDay}
					attendeeCount={entry.calendarEvent.attendeeCount}
					conferenceUrl={entry.calendarEvent.conferenceUrl}
				/>
			) : null}

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs empty:hidden">
				{dueAt ? (
					<StatusIndicator
						tone={overdue ? "error" : "info"}
						label={
							overdue ? (
								dueInDays === -1 ? (
									t("Overdue by 1 day")
								) : (
									t("Overdue by {n} days", { n: -dueInDays })
								)
							) : (
								<>
									{t("Due")} <LocalRelativeDate date={dueAt} />
								</>
							)
						}
					/>
				) : null}
				<RecordLinks entry={entry} anchor={anchor} />
			</div>
		</Row>
	);
}
