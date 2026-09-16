"use client";

import { DealStage } from "@crm/db/enums";
import { Checkbox } from "@crm/ui/components/checkbox";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { cleanSubject } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { LocalDateTime, LocalRelativeTime } from "@/components/local-date-time";
import { activityLabel, mailSourceLabel } from "@/lib/activity-presentation";
import { dealStageLabel } from "@/lib/deal-stage";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ActivityIcon } from "./activity-icon";
import { EmailThreadEntry, speaker } from "./email-thread-entry";
import { MeetingEntry } from "./meeting-entry";
import type { TimelineAnchor } from "./timeline";

export type TimelineEntryData =
	RouterOutputs["activities"]["timeline"]["entries"][number];

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "2-digit",
};

const stageChange = z
	.object({ from: z.enum(DealStage), to: z.enum(DealStage) })
	.nullable()
	.catch(null);

function anchorId(anchor: TimelineAnchor): string {
	if ("companyId" in anchor) return anchor.companyId;
	if ("contactId" in anchor) return anchor.contactId;
	return anchor.dealId;
}

export function TimelineEntry({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const t = useT();
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
	const done = entry.completedAt !== null;
	const overdue =
		isTask &&
		!done &&
		entry.dueAt !== null &&
		new Date(entry.dueAt) < new Date();

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
	const lastMessage = entry.emailThread?.lastMessage ?? null;
	const author = lastMessage ? speaker(lastMessage, t) : entry.createdBy.name;
	const source = lastMessage ? mailSourceLabel(lastMessage.source) : null;
	const hint = synced
		? entry.emailThread
			? source && t(source)
			: t("via Calendar")
		: null;

	const headline = change
		? `${t(dealStageLabel(change.from))} → ${t(dealStageLabel(change.to))}`
		: entry.subject
			? entry.emailThread
				? cleanSubject(entry.subject)
				: entry.subject
			: null;

	const here = anchorId(anchor);
	const deal = entry.deal && entry.deal.id !== here ? entry.deal : null;
	const contact =
		entry.contact && entry.contact.id !== here ? entry.contact : null;

	const footnotes = Boolean(
		deal || contact || (isTask && !done && entry.dueAt),
	);

	return (
		<li className="flex gap-2.5 py-2">
			<span className="mt-0.5 shrink-0 text-muted-foreground">
				{isTask ? (
					<Checkbox
						checked={done}
						disabled={complete.isPending}
						aria-label={done ? t("Mark as not done") : t("Mark as done")}
						onCheckedChange={(checked) =>
							complete.mutate({ id: entry.id, completed: checked === true })
						}
					/>
				) : (
					<span role="img" aria-label={t(activityLabel(entry.type))}>
						<ActivityIcon
							type={entry.type}
							direction={lastMessage?.direction}
						/>
					</span>
				)}
			</span>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-baseline gap-2">
					<span className="min-w-0 flex-1 truncate">
						{author}
						{hint ? (
							<span className="hidden text-muted-foreground sm:inline">
								{" "}
								· {hint}
							</span>
						) : null}
					</span>
					<span className="shrink-0 text-muted-foreground tabular-nums">
						<LocalDateTime date={when} options={TIME_OPTIONS} />
					</span>
				</div>

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
								: "whitespace-pre-wrap",
						)}
					>
						{body}
					</p>
				) : null}

				{!headline && !body ? (
					<p className="text-muted-foreground">
						{t(activityLabel(entry.type))}
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

				{entry.emailThread ? (
					<EmailThreadEntry
						threadId={entry.emailThread.id}
						messageCount={entry.emailThread.messageCount}
					/>
				) : null}

				{footnotes ? (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
						{isTask && !done && entry.dueAt ? (
							<StatusIndicator
								tone={overdue ? "error" : "info"}
								label={
									<>
										{overdue ? t("Overdue") : t("Due")}{" "}
										<LocalRelativeTime date={entry.dueAt} />
									</>
								}
							/>
						) : null}

						{deal ? (
							<RecordLink kind="deal" id={deal.id}>
								{deal.name}
							</RecordLink>
						) : null}

						{contact ? (
							<RecordLink kind="contact" id={contact.id}>
								{[contact.firstName, contact.lastName]
									.filter(Boolean)
									.join(" ")}
							</RecordLink>
						) : null}
					</div>
				) : null}
			</div>
		</li>
	);
}
