import {
	type MissingMailSkip,
	replyToMissingMail,
	type StoredMail,
} from "@crm/db/message-text";
import { isOwnAddress, type OwnIdentity } from "./participants";

export type ReplySkip =
	| MissingMailSkip
	| "linked"
	| "not-to-us"
	| "policy-off"
	| "sender-filtered"
	| "other-domain"
	| "archived-company"
	| "archived-contact";

export type ReplyMail = StoredMail & { recipients: readonly string[] };

export type OutreachReply<Mail extends ReplyMail> =
	| { reply: Mail; skip: null }
	| { reply: null; skip: MissingMailSkip | "not-to-us" };

export function outreachReply<Mail extends ReplyMail>(
	thread: { rootMessageId: string; messages: readonly Mail[] },
	own: OwnIdentity,
): OutreachReply<Mail> {
	if (thread.messages.some((message) => isOwnAddress(message.fromEmail, own))) {
		return { reply: null, skip: "two-sided" };
	}

	const found = replyToMissingMail(thread);
	if (!found.reply) return found;

	const toUs = found.reply.recipients.some((email) => isOwnAddress(email, own));
	if (!toUs) return { reply: null, skip: "not-to-us" };

	return found;
}
