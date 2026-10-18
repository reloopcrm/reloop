import { isAutoReply } from "@crm/db/message-text";
import {
	THREAD_CONTACT_ROLE,
	type ThreadContactRole,
} from "@crm/db/thread-participants";
import type { MatchContext } from "./mailbox-match.service";
import {
	isAutomatedAddress,
	isMachineAddress,
	isOwnAddress,
} from "./participants";

export type ParticipantMessage = {
	direction: string;
	fromEmail: string;
	subject: string | null;
	body: string | null;
	snippet: string | null;
	sentAt: Date;
	recipients: readonly string[];
};

export type Participation = {
	email: string;
	role: ThreadContactRole;
	firstAt: Date;
	lastAt: Date;
};

export function isLinkable(email: string, context: MatchContext): boolean {
	const address = email.trim().toLowerCase();
	const at = address.lastIndexOf("@");
	if (at < 1) return false;

	if (isOwnAddress(address, context)) return false;
	if (context.suppressedEmails.has(address)) return false;
	if (context.suppressedDomains.has(address.slice(at + 1))) return false;
	if (isMachineAddress(address) || isAutomatedAddress(address)) return false;

	return true;
}

export function planParticipants(
	messages: readonly ParticipantMessage[],
	threadSubject: string | null,
	context: MatchContext,
): Participation[] {
	const seen = new Map<string, Participation>();

	const note = (email: string, role: ThreadContactRole, at: Date) => {
		const address = email.trim().toLowerCase();
		if (!isLinkable(address, context)) return;

		const found = seen.get(address);
		if (!found) {
			seen.set(address, { email: address, role, firstAt: at, lastAt: at });
			return;
		}
		if (at < found.firstAt) found.firstAt = at;
		if (at > found.lastAt) found.lastAt = at;
		if (role === THREAD_CONTACT_ROLE.sender) found.role = role;
	};

	for (const message of messages) {
		if (
			isAutoReply(
				message.subject ?? threadSubject,
				message.body ?? message.snippet,
			)
		) {
			continue;
		}
		if (message.direction === "INBOUND") {
			note(message.fromEmail, THREAD_CONTACT_ROLE.sender, message.sentAt);
		} else if (message.direction === "OUTBOUND") {
			for (const recipient of message.recipients) {
				note(recipient, THREAD_CONTACT_ROLE.recipient, message.sentAt);
			}
		}
	}

	return [...seen.values()].sort(
		(a, b) =>
			rank(a.role) - rank(b.role) || a.firstAt.getTime() - b.firstAt.getTime(),
	);
}

function rank(role: ThreadContactRole): number {
	return role === THREAD_CONTACT_ROLE.sender ? 0 : 1;
}
