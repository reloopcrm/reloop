"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import { cleanEmailBody } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SECTION_TITLE } from "@/components/detail-sheet";
import { LocalDateTime, LocalDay } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type ThreadMessageData = RouterOutputs["google"]["thread"]["messages"][number];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

const LINE_MAX_CHARS = 180;

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

	return flat.length > LINE_MAX_CHARS
		? `${flat.slice(0, LINE_MAX_CHARS).trimEnd()}…`
		: flat;
}

function byDay(messages: ThreadMessageData[]) {
	const days = new Map<
		string,
		{ day: string; messages: ThreadMessageData[] }
	>();

	for (const message of [...messages].reverse()) {
		const day = message.sentAt.slice(0, 10);
		const group = days.get(day);
		if (group) {
			group.messages.push(message);
		} else {
			days.set(day, { day, messages: [message] });
		}
	}

	return [...days.values()];
}

export function EmailThreadEntry({
	threadId,
	messageCount,
}: {
	threadId: string;
	messageCount: number;
}) {
	const t = useT();
	const trpc = useTRPC();
	const [opened, setOpened] = useState(false);
	const [emails, setEmails] = useState(false);

	const thread = useQuery({
		...trpc.google.thread.queryOptions({ threadId }),
		enabled: opened,
	});

	const days = byDay(thread.data?.messages ?? []);
	const lead =
		messageCount > 2 && thread.data?.insight?.summary
			? thread.data.insight.summary
			: null;

	return (
		<Accordion
			type="single"
			collapsible
			onValueChange={(value) => {
				if (value) setOpened(true);
			}}
		>
			<AccordionItem value={threadId}>
				<AccordionTrigger variant="subtle">
					{messageCount === 1
						? t("1 message")
						: t("{count} messages", { count: messageCount })}
				</AccordionTrigger>

				<AccordionContent>
					{thread.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : thread.isError ? (
						<p className="text-muted-foreground text-xs">
							{thread.error.message}
						</p>
					) : (
						<div className="flex flex-col gap-2">
							{lead && !emails ? (
								<p className="text-pretty text-muted-foreground text-xs/5">
									{lead}
								</p>
							) : null}

							{days.map((group) => (
								<section key={group.day} className="flex flex-col gap-1">
									<h4 className={cn(SECTION_TITLE, "text-xs")}>
										<LocalDay date={group.day} />
									</h4>

									{emails ? (
										<div className="flex flex-col">
											{group.messages.map((message) => (
												<ThreadMessage
													key={message.id}
													from={speaker(message, t)}
													fromEmail={message.fromEmail}
													fromImageUrl={message.fromImageUrl}
													sentAt={
														<LocalDateTime
															date={message.sentAt}
															options={DATE_OPTIONS}
														/>
													}
													direction={message.direction}
													body={message.body}
													action={
														message.mailboxUrl ? (
															<a
																href={message.mailboxUrl}
																target="_blank"
																rel="noreferrer"
																className="text-muted-foreground underline underline-offset-3 hover:text-foreground"
															>
																{t("Open in {mailbox}", {
																	mailbox: message.mailboxName ?? "",
																})}
															</a>
														) : null
													}
												/>
											))}
										</div>
									) : (
										<ul className="flex flex-col gap-1">
											{group.messages.map((message) => {
												const text = line(message);
												return (
													<li
														key={message.id}
														className="text-pretty text-xs/5"
													>
														<span
															className={cn(
																"font-medium",
																message.direction === "OUTBOUND" &&
																	"text-muted-foreground",
															)}
														>
															{speaker(message, t)}:
														</span>{" "}
														<span className="text-muted-foreground">
															{text ?? t("Is read right now.")}
														</span>
													</li>
												);
											})}
										</ul>
									)}
								</section>
							))}

							<div>
								<Button
									variant="outline"
									size="xs"
									onClick={() => setEmails((shown) => !shown)}
								>
									{emails ? t("Show the summary") : t("Show the real emails")}
								</Button>
							</div>
						</div>
					)}
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
