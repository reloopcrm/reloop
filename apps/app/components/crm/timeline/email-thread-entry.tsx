"use client";

import { Button } from "@crm/ui/components/button";
import { EventMark, EventRow } from "@crm/ui/components/event-row";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import { cleanSubject, emailPreview } from "@crm/ui/lib/email-text";
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

export function EmailThreadEntry({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const t = useT();
	const trpc = useTRPC();
	const [opened, setOpened] = useState(false);

	const threadId = entry.emailThread?.id ?? "";
	const last = entry.emailThread?.lastMessage ?? null;
	const when = entry.occurredAt ?? entry.createdAt;

	const thread = useQuery({
		...trpc.google.thread.queryOptions({ threadId }),
		enabled: opened,
	});

	if (!last) return null;

	const subject = entry.subject ? cleanSubject(entry.subject) : null;
	const preview = entry.body
		? emailPreview(entry.body, TIMELINE.preview.maxChars)
		: null;

	const messages = thread.data?.messages ?? [];
	const lastLoaded = messages[messages.length - 1] ?? null;
	const to = lastLoaded?.recipients.map((one) => one.email).join(", ") ?? null;
	const source = mailSourceLabel(last.source);
	const reply = lastLoaded ? replyAddress(lastLoaded) : null;

	const meta = [
		to ? t("to {name}", { name: to }) : null,
		source ? t(source) : null,
	]
		.filter(Boolean)
		.join(" · ");

	const panel = (
		<div className="flex flex-col gap-3">
			{thread.isError ? (
				<p className="text-muted-foreground text-xs">{thread.error.message}</p>
			) : thread.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			) : (
				<>
					{messages.map((message) => (
						<ThreadMessage
							key={message.id}
							from={speaker(message, t)}
							fromEmail={message.fromEmail}
							fromImageUrl={message.fromImageUrl}
							sentAt={<MessageTime date={message.sentAt} day={when} />}
							direction={message.direction}
							body={message.body}
						/>
					))}

					{meta ? (
						<p className="font-mono text-faint-foreground text-xs wrap-anywhere">
							{meta}
						</p>
					) : null}

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
								<a
									href={lastLoaded.mailboxUrl}
									target="_blank"
									rel="noreferrer"
								>
									{t("Open in {mailbox}", {
										mailbox: lastLoaded.mailboxName ?? "",
									})}
								</a>
							</Button>
						) : null}
					</div>
				</>
			)}

			<RecordLinks entry={entry} anchor={anchor} />
		</div>
	);

	return (
		<EventRow
			data-demo={DEMO.mark.emailThread}
			voice={last.direction === "INBOUND" ? "inbound" : "outbound"}
			time={<LocalDateTime date={when} options={TIMELINE.format.time} />}
			mark={
				<EventMark
					kind={last.direction === "INBOUND" ? "inbound" : "outbound"}
				/>
			}
			who={speaker(last, t)}
			subject={subject}
			preview={preview}
			panel={panel}
			onOpen={() => setOpened(true)}
		/>
	);
}
