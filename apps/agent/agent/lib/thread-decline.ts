import {
	DECLINE_KIND,
	DECLINED_OUTCOME,
	type DeclineKind,
	type InsightOutcome,
} from "@crm/db/insights";
import { isRealAnswer } from "@crm/db/message-text";

export type DeclineMail = {
	direction: string;
	fromEmail: string;
	subject?: string | null;
	sentAt: Date;
	body: string | null;
	snippet: string | null;
};

export type DeclineThread = {
	lastMessageAt: Date;
	contact?: { email: string | null } | null;
	messages: DeclineMail[];
};

export type DeclineFields = {
	outcome: InsightOutcome;
	declineKind: DeclineKind | null;
	declinedAt: Date | null;
};

export type StoredDecline = {
	declineKind: string | null;
	declinedAt: Date | null;
} | null;

function normalized(address: string): string {
	return address.trim().toLowerCase();
}

export function isTheirAnswer(
	thread: DeclineThread,
	message: DeclineMail,
): boolean {
	const own = thread.contact?.email;
	if (own && normalized(message.fromEmail) !== normalized(own)) return false;

	return isRealAnswer({
		direction: message.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
		fromEmail: message.fromEmail,
		subject: message.subject ?? null,
		body: message.body,
		snippet: message.snippet,
	});
}

function lastAnswerIndex(
	thread: DeclineThread,
	messages: readonly DeclineMail[],
): number {
	for (let at = messages.length - 1; at >= 0; at -= 1) {
		const message = messages[at];
		if (message && isTheirAnswer(thread, message)) return at;
	}

	return -1;
}

export function stopIsLastWord(
	thread: DeclineThread,
	shown: readonly DeclineMail[],
	stopRequest: number | null,
): boolean {
	if (stopRequest === null) return false;

	const latest = lastAnswerIndex(thread, shown) + 1;

	return latest > 0 && stopRequest === latest;
}

function lastAnswerAt(thread: DeclineThread): Date | null {
	return (
		thread.messages[lastAnswerIndex(thread, thread.messages)]?.sentAt ?? null
	);
}

export function settledDecline<
	T extends { outcome: InsightOutcome; declineKind: DeclineKind | null },
>(
	answer: T,
	stopped: boolean,
	thread: DeclineThread,
): Omit<T, keyof DeclineFields> & DeclineFields {
	const declinedAt = lastAnswerAt(thread);

	if (stopped && declinedAt !== null) {
		return {
			...answer,
			outcome: DECLINED_OUTCOME,
			declineKind: DECLINE_KIND.hard,
			declinedAt,
		};
	}
	if (answer.outcome !== DECLINED_OUTCOME) {
		return { ...answer, declineKind: null, declinedAt: null };
	}
	if (answer.declineKind === DECLINE_KIND.hard && declinedAt !== null) {
		return { ...answer, declineKind: DECLINE_KIND.hard, declinedAt };
	}

	return { ...answer, declineKind: DECLINE_KIND.soft, declinedAt: null };
}

export function keptDecline<T extends DeclineFields>(
	verdict: T,
	stored: StoredDecline,
	thread: DeclineThread,
): T {
	if (stored?.declineKind !== DECLINE_KIND.hard) return verdict;
	if (verdict.declineKind === DECLINE_KIND.hard) return verdict;

	const since = stored.declinedAt;
	if (since === null) return verdict;

	const refusalStands = thread.messages.some(
		(message) =>
			message.sentAt.getTime() === since.getTime() &&
			isTheirAnswer(thread, message),
	);
	if (!refusalStands) return verdict;

	const answered = thread.messages.some(
		(message) => message.sentAt > since && isTheirAnswer(thread, message),
	);
	if (answered) return verdict;

	return {
		...verdict,
		outcome: DECLINED_OUTCOME,
		declineKind: DECLINE_KIND.hard,
		declinedAt: since,
	};
}
