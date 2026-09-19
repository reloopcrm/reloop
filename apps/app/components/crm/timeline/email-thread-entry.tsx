"use client";

import { Button } from "@crm/ui/components/button";
import { EventMark, EventRow } from "@crm/ui/components/event-row";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import {
	cleanEmailBody,
	cleanSubject,
	emailPreview,
} from "@crm/ui/lib/email-text";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DEMO } from "@/components/demo/demo-tour-config";
import { LocalDateTime, localDayKey } from "@/components/local-date-time";
import { mailSourceLabel } from "@/lib/activity-presentation";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { TimelineAnchor } from "./timeline";
import { TIMELINE } from "./timeline-config";
import { RecordLinks, type TimelineEntryData } from "./timeline-entry";

type ThreadMessageData = RouterOutputs["google"]["thread"]["messages"][number];

export function speaker(
	message: Pick<ThreadMessageData, "direction" | "fromName" | "fromEmail">,
	t: Translate,
): string {
	if (message.direction === "OUTBOUND") return t("You");
	const name = message.fromName?.trim();
	return name && name.length > 0 ? name : message.fromEmail;
}

export function MessageTime({ date, day }: { date: string; day: string }) {
	const sameDay = localDayKey(date) === localDayKey(day);
	return (
		<>
			{sameDay ? null : (
				<>
					<span className="text-faint-foreground">
						<LocalDateTime date={date} options={TIMELINE.format.day} />
					</span>{" "}
				</>
			)}
			<LocalDateTime date={date} options={TIMELINE.format.time} />
		</>
	);
}

function replyAddress(message: ThreadMessageData): string | null {
	if (message.direction === "INBOUND") return message.fromEmail;
	return message.recipients[0]?.email ?? null;
}

export function threadAnchorId(threadId: string): string {
	return `thread-${threadId}`;
}

function threadMessageCount(entries: TimelineEntryData[]): number {
	return entries.reduce(
		(sum, entry) => sum + (entry.emailThread?.messageCount ?? 0),
		0,
	);
}

function ThreadPart({
	entry,
	day,
	subject,
	enabled,
	actions,
}: {
	entry: TimelineEntryData;
	day: string;
	subject: string | null;
	enabled: boolean;
	actions: boolean;
}) {
	const t = useT();
	const trpc = useTRPC();
	const threadId = entry.emailThread?.id ?? "";

	const thread = useQuery({
		...trpc.google.thread.queryOptions({ threadId }),
		enabled: enabled && threadId !== "",
	});

	if (thread.isError) {
		return (
			<>
				{entry.body ? (
					<p className="whitespace-pre-wrap text-pretty wrap-anywhere text-body-foreground">
						{cleanEmailBody(entry.body).text}
					</p>
				) : null}
				<p className="text-muted-foreground text-xs">{thread.error.message}</p>
			</>
		);
	}

	if (thread.isPending) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}

	const messages = thread.data?.messages ?? [];
	const lastLoaded = messages[messages.length - 1] ?? null;
	const to = lastLoaded?.recipients.map((one) => one.email).join(", ") ?? null;
	const source = mailSourceLabel(
		entry.emailThread?.lastMessage?.source ?? null,
	);
	const reply = lastLoaded ? replyAddress(lastLoaded) : null;

	const meta = [
		to ? t("to {name}", { name: to }) : null,
		source ? t(source) : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<>
			{messages.map((message) => (
				<ThreadMessage
					key={message.id}
					from={speaker(message, t)}
					fromEmail={message.fromEmail}
					fromImageUrl={message.fromImageUrl}
					sentAt={<MessageTime date={message.sentAt} day={day} />}
					direction={message.direction}
					body={message.body}
				/>
			))}

			{actions && meta ? (
				<p className="font-mono text-faint-foreground text-xs wrap-anywhere">
					{meta}
				</p>
			) : null}

			{actions ? (
				<div className="flex flex-wrap items-center gap-2">
					{reply ? (
						<Button variant="outline" size="xs" asChild>
							<a
								href={`mailto:${reply}?subject=${encodeURIComponent(`Re: ${subject ?? ""}`)}`}
							>
								{t("Reply")}
							</a>
						</Button>
					) : null}
					{lastLoaded?.mailboxUrl ? (
						<Button variant="outline" size="xs" asChild>
							<a href={lastLoaded.mailboxUrl} target="_blank" rel="noreferrer">
								{t("Open in {mailbox}", {
									mailbox: lastLoaded.mailboxName ?? "",
								})}
							</a>
						</Button>
					) : null}
				</div>
			) : null}
		</>
	);
}

export function EmailThreadEntry({
	entries,
	anchor,
	openThreadId,
}: {
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
	openThreadId?: string | null;
}) {
	const t = useT();
	const [opened, setOpened] = useState(false);

	const head = entries[0];
	const last = head?.emailThread?.lastMessage ?? null;

	if (!head || !last) return null;

	const threadIds = entries.flatMap((entry) =>
		entry.emailThread ? [entry.emailThread.id] : [],
	);
	const linked =
		openThreadId !== null &&
		openThreadId !== undefined &&
		threadIds.includes(openThreadId);

	const when = head.occurredAt ?? head.createdAt;
	const subject = head.subject ? cleanSubject(head.subject) : null;
	const count = threadMessageCount(entries);

	const preview =
		entries.length > 1
			? count === 1
				? t("1 message")
				: t("{count} messages", { count })
			: head.body
				? emailPreview(head.body, TIMELINE.preview.maxChars)
				: null;

	const voice = last.direction === "INBOUND" ? "inbound" : "outbound";

	const panel = (
		<div className="flex flex-col gap-3">
			{[...entries].reverse().map((entry, index) => (
				<ThreadPart
					key={entry.id}
					entry={entry}
					day={when}
					subject={subject}
					enabled={opened || linked}
					actions={index === entries.length - 1}
				/>
			))}

			<RecordLinks entry={head} anchor={anchor} />
		</div>
	);

	const row = (
		<EventRow
			data-demo={DEMO.mark.emailThread}
			voice={voice}
			time={<LocalDateTime date={when} options={TIMELINE.format.time} />}
			mark={<EventMark kind={voice} />}
			who={speaker(last, t)}
			subject={subject}
			preview={preview}
			panel={panel}
			anchorId={
				threadIds[0] === undefined ? undefined : threadAnchorId(threadIds[0])
			}
			defaultOpen={linked}
			onOpen={() => setOpened(true)}
		/>
	);

	if (threadIds.length < 2) return row;

	return (
		<>
			{threadIds.slice(1).map((threadId) => (
				<span key={threadId} id={threadAnchorId(threadId)} aria-hidden="true" />
			))}
			{row}
		</>
	);
}
