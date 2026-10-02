"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	MailItem,
	MailItemBody,
	MailItemFooter,
	MailItemHeader,
	MailItemSubject,
	MailItemTags,
	TextMark,
} from "@crm/ui/components/story";
import { cleanEmailBody } from "@crm/ui/lib/email-text";
import { LocalDateTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { numberFormat } from "@/lib/i18n/format";
import {
	markSegments,
	type PersonMail,
	type PersonView,
	personName,
} from "./person-view";

const LONG_DAY = { day: "numeric", month: "long", year: "numeric" } as const;

export function mailElementId(id: string): string {
	return `mail-${id}`;
}

function MailText({ mail }: { mail: PersonMail }) {
	const text = mail.body
		? cleanEmailBody(mail.body).text
		: (mail.summary ?? "");

	return (
		<MailItemBody>
			{markSegments(text, mail.marks).map((segment) =>
				segment.marked ? (
					<TextMark key={segment.start}>{segment.text}</TextMark>
				) : (
					<span key={segment.start}>{segment.text}</span>
				),
			)}
		</MailItemBody>
	);
}

export function PersonMails({
	view,
	highlighted,
}: {
	view: PersonView;
	highlighted: ReadonlySet<string>;
}) {
	const t = useT();
	const locale = useLocale();
	const format = numberFormat(locale).format;
	const name = personName(view.contact);
	const first = view.contact.firstName;

	return (
		<div className="flex flex-col gap-2.5">
			<p className="text-2sm text-muted-foreground">
				{t(
					"{count} emails with {name}, newest first. Marked is the passage the story builds on.",
					{ count: format(view.mailCount), name: first },
				)}
				{view.mails.length < view.mailCount
					? ` ${t("Showing the newest {shown}.", { shown: format(view.mails.length) })}`
					: null}
			</p>
			{view.mails.map((mail) => {
				const mine = mail.direction === "OUTBOUND";
				return (
					<MailItem
						key={mail.id}
						id={mailElementId(mail.id)}
						mine={mine}
						highlighted={highlighted.has(mail.id)}
					>
						<MailItemHeader
							who={
								<>
									<PersonAvatar
										src={mine ? null : view.contact.imageUrl}
										name={mine ? (mail.fromName ?? mail.fromEmail) : name}
										email={mail.fromEmail}
										size="sm"
									/>
									<span className="min-w-0 truncate">
										{mine ? t("You") : (mail.fromName ?? name)}
									</span>
									<span className="text-muted-foreground">
										{mine ? t("to {name}", { name: first }) : t("to you")}
									</span>
								</>
							}
							when={<LocalDateTime date={mail.sentAt} options={LONG_DAY} />}
						/>
						{mail.unanswered || mail.key ? (
							<MailItemTags>
								{mail.unanswered ? (
									<Badge variant="outline">{t("Unanswered")}</Badge>
								) : null}
								{mail.key ? <Badge>{t("This passage matters")}</Badge> : null}
							</MailItemTags>
						) : null}
						<MailItemSubject>
							{mail.subject ?? t("(no subject)")}
						</MailItemSubject>
						<MailText mail={mail} />
						{mail.mailboxUrl && mail.mailboxName ? (
							<MailItemFooter>
								<Button asChild variant="link" size="text">
									<a href={mail.mailboxUrl} target="_blank" rel="noreferrer">
										{t("Open in {mailbox}", { mailbox: mail.mailboxName })}
									</a>
								</Button>
							</MailItemFooter>
						) : null}
					</MailItem>
				);
			})}
		</div>
	);
}
