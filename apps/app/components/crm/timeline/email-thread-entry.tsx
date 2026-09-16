"use client";

import Email from "@carbon/icons-react/es/Email";
import { Icon } from "@crm/ui/components/icon";
import { Link } from "@crm/ui/components/link";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import { cleanEmailBody, cleanSubject } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { DEMO } from "@/components/demo/demo-tour-config";
import { LocalDateTime } from "@/components/local-date-time";
import { mailSourceLabel } from "@/lib/activity-presentation";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { TimelineAnchor } from "./timeline";
import { TIMELINE } from "./timeline-config";
import {
	contactName,
	Meta,
	RecordLinks,
	Row,
	type TimelineEntryData,
} from "./timeline-entry";

type ThreadMessageData = RouterOutputs["google"]["thread"]["messages"][number];

export function speaker(
	message: Pick<ThreadMessageData, "direction" | "fromName" | "fromEmail">,
	t: Translate,
): string {
	if (message.direction === "OUTBOUND") return t("You");
	const name = message.fromName?.trim();
	return name && name.length > 0 ? name : message.fromEmail;
}

function line(message: ThreadMessageData): string | null {
	if (message.summary) return message.summary;

	const text = message.body
		? cleanEmailBody(message.body).text
		: (message.snippet ?? "");
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length === 0) return null;

	return flat.length > TIMELINE.preview.maxChars
		? `${flat.slice(0, TIMELINE.preview.maxChars).trimEnd()}…`
		: flat;
}

function MessageRow({
	direction,
	who,
	detail,
	time,
	text,
	waiting = false,
	foot,
}: {
	direction: "INBOUND" | "OUTBOUND";
	who: string;
	detail: string | null;
	time: ReactNode;
	text: string | null;
	waiting?: boolean;
	foot?: ReactNode;
}) {
	const inbound = direction === "INBOUND";
	const content = (
		<>
			<Meta lead={who} detail={detail} time={time} />
			{text ? (
				<p className="text-pretty wrap-anywhere text-body-foreground">{text}</p>
			) : null}
			{foot}
		</>
	);

	return inbound ? (
		<Row marker={<span className="size-2 rounded-xs bg-body-foreground" />}>
			<div
				className={cn(
					"flex flex-col gap-1 rounded-lg border bg-muted p-3",
					waiting && "border-border-strong",
				)}
			>
				{content}
			</div>
		</Row>
	) : (
		<Row
			indent
			marker={
				<span className="size-2 rounded-xs border border-muted-foreground" />
			}
		>
			{content}
		</Row>
	);
}

function MessageTime({ date, day }: { date: string; day: string }) {
	const sameDay = date.slice(0, 10) === day.slice(0, 10);
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

function EmailThreadEntry({
	entry,
	anchor,
	waiting,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
	waiting: boolean;
}) {
	const t = useT();
	const trpc = useTRPC();
	const [opened, setOpened] = useState(false);
	const [emails, setEmails] = useState(false);

	const threadId = entry.emailThread?.id ?? "";
	const messageCount = entry.emailThread?.messageCount ?? 0;
	const last = entry.emailThread?.lastMessage ?? null;
	const when = entry.occurredAt ?? entry.createdAt;
	const contact = contactName(entry.contact);

	const thread = useQuery({
		...trpc.google.thread.queryOptions({ threadId }),
		enabled: opened,
	});

	const messages = thread.data?.messages ?? [];
	const lastLoaded = messages[messages.length - 1] ?? null;

	const recipient = (direction: "INBOUND" | "OUTBOUND") =>
		direction === "INBOUND"
			? t("to you")
			: contact
				? t("to {name}", { name: contact })
				: null;

	const links = (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs empty:hidden">
			{waiting ? (
				<span className="inline-flex items-center gap-2 font-medium text-foreground">
					<span className="size-1.5 rounded-xs border border-foreground" />
					{t("Unanswered since")}{" "}
					<LocalDateTime
						date={entry.emailThread?.lastMessageAt ?? when}
						options={TIMELINE.format.day}
					/>
				</span>
			) : null}
			<RecordLinks entry={entry} anchor={anchor} />
		</div>
	);

	if (!last) return null;

	if (!opened || thread.isError) {
		return (
			<>
				<MessageRow
					direction={last.direction}
					who={speaker(last, t)}
					detail={recipient(last.direction)}
					time={<LocalDateTime date={when} options={TIMELINE.format.time} />}
					text={entry.body}
					waiting={waiting}
					foot={links}
				/>
				<div className="flex items-center gap-4 pb-2 pl-8 text-muted-foreground text-xs">
					{thread.isError ? (
						<span>{thread.error.message}</span>
					) : (
						<Link asChild>
							<button
								type="button"
								data-demo={DEMO.mark.emailThread}
								onClick={() => setOpened(true)}
							>
								{messageCount === 1
									? t("1 message")
									: t("{count} messages", { count: messageCount })}
							</button>
						</Link>
					)}
				</div>
			</>
		);
	}

	if (thread.isPending) {
		return (
			<Row marker={<span className="size-2 rounded-xs bg-body-foreground" />}>
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-4 w-2/3" />
			</Row>
		);
	}

	return (
		<>
			{messages.map((message, index) =>
				emails ? (
					<Row
						key={message.id}
						indent={message.direction === "OUTBOUND"}
						marker={
							<span
								className={cn(
									"size-2 rounded-xs",
									message.direction === "OUTBOUND"
										? "border border-muted-foreground"
										: "bg-body-foreground",
								)}
							/>
						}
					>
						<ThreadMessage
							from={speaker(message, t)}
							fromEmail={message.fromEmail}
							fromImageUrl={message.fromImageUrl}
							sentAt={<MessageTime date={message.sentAt} day={when} />}
							direction={message.direction}
							body={message.body}
						/>
					</Row>
				) : (
					<MessageRow
						key={message.id}
						direction={message.direction}
						who={speaker(message, t)}
						detail={recipient(message.direction)}
						time={<MessageTime date={message.sentAt} day={when} />}
						text={line(message) ?? t("Is read right now.")}
						waiting={waiting && index === messages.length - 1}
						foot={index === messages.length - 1 ? links : undefined}
					/>
				),
			)}
			<div className="flex flex-wrap items-center gap-4 pb-2 pl-8 text-muted-foreground text-xs">
				<Link asChild>
					<button type="button" onClick={() => setEmails((shown) => !shown)}>
						{emails ? t("Show the summary") : t("Show the real emails")}
					</button>
				</Link>
				{lastLoaded?.mailboxUrl ? (
					<Link href={lastLoaded.mailboxUrl} target="_blank" rel="noreferrer">
						{t("Open in {mailbox}", { mailbox: lastLoaded.mailboxName ?? "" })}
					</Link>
				) : null}
			</div>
		</>
	);
}

export function EmailThreadBlock({
	entries,
	anchor,
	waitingId,
}: {
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
	waitingId: string | null;
}) {
	const t = useT();
	const head = entries[0];
	if (!head) return null;

	const count = entries.reduce(
		(sum, entry) => sum + (entry.emailThread?.messageCount ?? 0),
		0,
	);
	const source = mailSourceLabel(head.emailThread?.lastMessage?.source ?? null);
	const when = head.occurredAt ?? head.createdAt;
	const subject = head.subject ? cleanSubject(head.subject) : null;

	return (
		<div className="flex flex-col">
			<Row
				className="pt-3"
				marker={
					<span role="img" aria-label={t("Email")}>
						<Icon icon={Email} />
					</span>
				}
			>
				<Meta
					lead={t("Email")}
					tone="kind"
					detail={[
						count === 1 ? t("1 message") : t("{count} messages", { count }),
						source ? t(source) : null,
					]
						.filter(Boolean)
						.join(" · ")}
					time={<LocalDateTime date={when} options={TIMELINE.format.time} />}
				/>
				{subject ? (
					<p className="wrap-anywhere font-medium">{subject}</p>
				) : null}
			</Row>

			{[...entries].reverse().map((entry) => (
				<EmailThreadEntry
					key={entry.id}
					entry={entry}
					anchor={anchor}
					waiting={entry.id === waitingId}
				/>
			))}
		</div>
	);
}
