import { type AddressObject, simpleParser } from "mailparser";
import {
	normaliseMessageId,
	rootMessageIdFrom,
	stripHtml,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { type Participant, parseAddress } from "../mailbox/participants";
import type { IncomingMessage } from "../mailbox/thread-writer.service";

export type RawImapMessage = {
	uid: number;
	source: Buffer;
	internalDate: Date | null;
};

export type ImapMessageOrigin = {
	accountId: string;
	folder: string;
	uidValidity: string;
};

type Recipient = { email: string; name: string | null; kind: "to" | "cc" };

export async function parseImapMessage(
	raw: RawImapMessage,
	origin: ImapMessageOrigin,
): Promise<IncomingMessage | null> {
	const mail = await simpleParser(raw.source, { skipImageLinks: true });

	const from = firstAddress(mail.from);
	if (!from) return null;

	const sentAt = dateOf(mail.date) ?? raw.internalDate;
	if (!sentAt) return null;

	const messageId = mail.messageId?.trim()
		? normaliseMessageId(mail.messageId)
		: syntheticMessageId(raw, origin);

	const references = Array.isArray(mail.references)
		? mail.references.join(" ")
		: (mail.references ?? null);

	const rootId =
		rootMessageIdFrom({
			references,
			inReplyTo: mail.inReplyTo ?? null,
			messageId,
		}) ?? messageId;

	const text = mail.text?.trim() || (mail.html ? stripHtml(mail.html) : "");

	return {
		rfcMessageId: messageId,
		rootId,
		subject: mail.subject?.trim() || null,
		from,
		recipients: [...addressList(mail.to, "to"), ...addressList(mail.cc, "cc")],
		body: stripQuotedHistory(text),
		sentAt,
		imapAccountId: origin.accountId,
	};
}

function syntheticMessageId(
	raw: RawImapMessage,
	origin: ImapMessageOrigin,
): string {
	const folder = origin.folder
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
	return `imap-${origin.accountId}-${folder}-${origin.uidValidity}-${raw.uid}@local.invalid`;
}

function dateOf(value: Date | undefined): Date | null {
	if (!value) return null;
	return Number.isNaN(value.getTime()) ? null : value;
}

function firstAddress(entry: AddressObject | undefined): Participant | null {
	for (const address of entry?.value ?? []) {
		const person = participantOf(address.address, address.name);
		if (person) return person;
	}

	return null;
}

function addressList(
	entries: AddressObject | AddressObject[] | undefined,
	kind: "to" | "cc",
): Recipient[] {
	const groups = Array.isArray(entries) ? entries : entries ? [entries] : [];
	const seen = new Set<string>();
	const people: Recipient[] = [];

	for (const group of groups) {
		for (const address of group.value) {
			const person = participantOf(address.address, address.name);
			if (!person || seen.has(person.email)) continue;

			seen.add(person.email);
			people.push({ email: person.email, name: person.name, kind });
		}
	}

	return people;
}

function participantOf(
	address: string | undefined,
	name: string | undefined,
): Participant | null {
	const email = address?.trim();
	if (!email) return null;

	const label = name?.trim();
	return parseAddress(label ? `${label} <${email}>` : email);
}
