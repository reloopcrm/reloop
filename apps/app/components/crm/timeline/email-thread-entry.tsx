"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Reply from "@carbon/icons-react/es/Reply";
import { Button } from "@crm/ui/components/button";
import { EventMark, EventRow } from "@crm/ui/components/event-row";
import { Icon } from "@crm/ui/components/icon";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import {
	cleanEmailBody,
	cleanSubject,
	emailPreview,
} from "@crm/ui/lib/email-text";
import { useQueries } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { DEMO } from "@/components/demo/demo-tour-config";
import { LocalDateTime, localDayKey } from "@/components/local-date-time";
import { mailSourceLabel } from "@/lib/activity-presentation";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { TimelineAnchor } from "./timeline";
import { blockMessages } from "./timeline-blocks";
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

function blockThreads(
	entries: readonly TimelineEntryData[],
): NonNullable<TimelineEntryData["emailThread"]>[] {
	const kept = new Map<string, NonNullable<TimelineEntryData["emailThread"]>>();

	for (const entry of entries) {
		if (entry.emailThread) kept.set(entry.emailThread.id, entry.emailThread);
	}

	return [...kept.values()];
}

function messageAnchorId(messageId: string): string {
	return `message-${messageId}`;
}

function forwardHref(
	message: ThreadMessageData,
	subject: string | null,
	t: Translate,
): string {
	const text = message.body ? cleanEmailBody(message.body).text : "";
	const from = message.fromName?.trim()
		? `${message.fromName.trim()} <${message.fromEmail}>`
		: message.fromEmail;
	const body = [
		"",
		t("Forwarded message"),
		t("From: {sender}", { sender: from }),
		t("Subject: {subject}", { subject: subject ?? "" }),
		"",
		text,
	].join("\n");

	return `mailto:?subject=${encodeURIComponent(`Fwd: ${subject ?? ""}`)}&body=${encodeURIComponent(body)}`;
}

function ThreadPanel({
	head,
	threadIds,
	day,
	subject,
	enabled,
	openMessageId,
}: {
	head: TimelineEntryData;
	threadIds: readonly string[];
	day: string;
	subject: string | null;
	enabled: boolean;
	openMessageId: string | null;
}) {
	const t = useT();
	const trpc = useTRPC();
	const scrolled = useRef<string | null>(null);

	const results = useQueries({
		queries: threadIds.map((threadId) => ({
			...trpc.google.thread.queryOptions({ threadId }),
			enabled: enabled && threadId !== "",
		})),
	});

	const failure = results.find((result) => result.isError);

	if (failure?.error && results.every((result) => result.isError)) {
		return (
			<>
				{head.body ? (
					<p className="whitespace-pre-wrap text-pretty wrap-anywhere text-body-foreground">
						{cleanEmailBody(head.body).text}
					</p>
				) : null}
				<p className="text-muted-foreground text-xs">{failure.error.message}</p>
			</>
		);
	}

	if (results.some((result) => result.isPending)) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}

	const messages = blockMessages(
		results.map((result) => result.data?.messages ?? []),
	);
	const newest = messages[0] ?? null;
	const older = messages.slice(1).reverse();
	const summary =
		results
			.map((result) => result.data?.insight?.summary?.trim())
			.find((text) => text) ?? null;
	const to = newest?.recipients.map((one) => one.email).join(", ") ?? null;
	const source = mailSourceLabel(head.emailThread?.lastMessage?.source ?? null);
	const reply = newest ? replyAddress(newest) : null;

	const meta = [
		to ? t("to {name}", { name: to }) : null,
		source ? t(source) : null,
	]
		.filter(Boolean)
		.join(" · ");

	const anchorRef = (messageId: string) =>
		openMessageId === messageId
			? (node: HTMLElement | null) => {
					if (!node || scrolled.current === messageId) return;
					scrolled.current = messageId;
					node.scrollIntoView({ block: "center" });
				}
			: undefined;

	return (
		<>
			{summary ? (
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-xs">{t("In short")}</p>
					<p className="text-pretty text-foreground">{summary}</p>
				</div>
			) : null}

			{older.length > 0 ? (
				<div className="flex flex-col">
					{older.map((message) => (
						<ThreadMessage
							key={message.id}
							id={messageAnchorId(message.id)}
							ref={anchorRef(message.id)}
							collapsed={openMessageId !== message.id}
							preview={
								message.body
									? emailPreview(message.body, TIMELINE.preview.maxChars)
									: null
							}
							from={speaker(message, t)}
							fromEmail={message.fromEmail}
							fromImageUrl={message.fromImageUrl}
							sentAt={<MessageTime date={message.sentAt} day={day} />}
							direction={message.direction}
							body={message.body}
							size="reading"
						/>
					))}
				</div>
			) : null}

			{newest ? (
				<ThreadMessage
					id={messageAnchorId(newest.id)}
					ref={anchorRef(newest.id)}
					from={speaker(newest, t)}
					fromEmail={newest.fromEmail}
					fromImageUrl={newest.fromImageUrl}
					sentAt={<MessageTime date={newest.sentAt} day={day} />}
					direction={newest.direction}
					body={newest.body}
					size="reading"
				/>
			) : null}

			{meta ? (
				<p className="font-mono text-faint-foreground text-xs wrap-anywhere">
					{meta}
				</p>
			) : null}

			{newest ? (
				<div className="flex flex-wrap items-center gap-2">
					{reply ? (
						<Button variant="outline" size="xs" asChild>
							<a
								href={`mailto:${reply}?subject=${encodeURIComponent(`Re: ${subject ?? ""}`)}`}
							>
								<Icon icon={Reply} data-icon="inline-start" />
								{t("Reply")}
							</a>
						</Button>
					) : null}
					<Button variant="outline" size="xs" asChild>
						<a href={forwardHref(newest, subject, t)}>
							<Icon icon={ArrowRight} data-icon="inline-start" />
							{t("Forward")}
						</a>
					</Button>
					{newest.mailboxUrl ? (
						<Button variant="ghost" size="xs" asChild>
							<a href={newest.mailboxUrl} target="_blank" rel="noreferrer">
								{t("Open in {mailbox}", {
									mailbox: newest.mailboxName ?? "",
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
	openMessageId,
}: {
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
	openThreadId?: string | null;
	openMessageId?: string | null;
}) {
	const t = useT();
	const [opened, setOpened] = useState(false);

	const head = entries[0];
	const last = head?.emailThread?.lastMessage ?? null;

	if (!head || !last) return null;

	const threads = blockThreads(entries);
	const threadIds = threads.map((thread) => thread.id);
	const linked =
		openThreadId !== null &&
		openThreadId !== undefined &&
		threadIds.includes(openThreadId);

	const when = head.occurredAt ?? head.createdAt;
	const subject = head.subject ? cleanSubject(head.subject) : null;
	const count = threads.reduce(
		(sum, thread) => sum + (thread.messageCount ?? 0),
		0,
	);

	const preview =
		threads.length > 1
			? count === 1
				? t("1 message")
				: t("{count} messages", { count })
			: head.body
				? emailPreview(head.body, TIMELINE.preview.maxChars)
				: null;

	const voice = last.direction === "INBOUND" ? "inbound" : "outbound";

	const panel = (
		<div className="flex flex-col gap-3">
			<ThreadPanel
				head={head}
				threadIds={threadIds}
				day={when}
				subject={subject}
				enabled={opened || linked}
				openMessageId={openMessageId ?? null}
			/>

			<RecordLinks entries={entries} anchor={anchor} />
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
