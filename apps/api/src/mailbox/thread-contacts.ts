import { isAutoReply } from "@crm/db/message-text";
import type { MatchContext } from "./mailbox-match.service";
import {
	externalParticipants,
	isAutomatedAddress,
	isMachineAddress,
	isOwnAddress,
	workDomain,
} from "./participants";

export const SENDER_VERDICTS = [
	"create",
	"own",
	"suppressed",
	"automated",
	"free-mail",
	"auto-reply",
	"other-domain",
	"policy-off",
	"known",
] as const;

export type SenderVerdict = (typeof SENDER_VERDICTS)[number];

export const THREAD_SKIPS = ["no-company-domain", "archived-company"] as const;

export type ThreadSkip = (typeof THREAD_SKIPS)[number];

export type ThreadMessage = {
	direction: string;
	fromEmail: string;
	fromName: string | null;
	subject: string | null;
	body: string | null;
	snippet: string | null;
	syncedByUserId: string | null;
	sentAt: Date;
	recipients: readonly string[];
};

export type ThreadCompany = {
	id: string;
	domain: string | null;
	archivedAt: Date | null;
};

export type PlannedThread = {
	subject: string | null;
	company: ThreadCompany | null;
	messages: readonly ThreadMessage[];
};

export type SenderOutcome = {
	email: string;
	name: string | null;
	domain: string | null;
	verdict: Exclude<SenderVerdict, "known">;
	ownerId: string | null;
	lastMailAt: Date;
};

export type ThreadPlan =
	| { skip: ThreadSkip; companyId: null; senders: [] }
	| { skip: null; companyId: string; senders: SenderOutcome[] };

export type CreatePolicy = {
	context: MatchContext;
	creatingOwners: ReadonlySet<string>;
};

export function senderVerdict(
	message: ThreadMessage,
	threadSubject: string | null,
	companyDomain: string,
	context: MatchContext,
): Exclude<SenderVerdict, "policy-off" | "known"> {
	const email = message.fromEmail.trim().toLowerCase();
	const domain = workDomain(email);

	if (isOwnAddress(email, context)) return "own";
	if (
		context.suppressedEmails.has(email) ||
		(domain !== null && context.suppressedDomains.has(domain))
	) {
		return "suppressed";
	}
	if (isMachineAddress(email) || isAutomatedAddress(email)) return "automated";
	if (domain === null) return "free-mail";
	if (
		externalParticipants([{ email, name: message.fromName }], context)
			.length === 0
	) {
		return "automated";
	}
	if (
		isAutoReply(
			message.subject ?? threadSubject,
			message.body ?? message.snippet,
		)
	) {
		return "auto-reply";
	}
	if (domain !== companyDomain) return "other-domain";

	return "create";
}

export function planThread(
	thread: PlannedThread,
	policy: CreatePolicy,
): ThreadPlan {
	const company = thread.company;
	if (!company?.domain) {
		return { skip: "no-company-domain", companyId: null, senders: [] };
	}
	if (company.archivedAt) {
		return { skip: "archived-company", companyId: null, senders: [] };
	}

	const senders = new Map<string, SenderOutcome>();
	const lastMail = new Map<string, Date>();
	const mailed = (email: string, at: Date) => {
		const seen = lastMail.get(email);
		if (!seen || seen < at) lastMail.set(email, at);
	};

	for (const message of thread.messages) {
		if (message.direction === "OUTBOUND") {
			for (const recipient of message.recipients) {
				mailed(recipient.trim().toLowerCase(), message.sentAt);
			}
			continue;
		}
		if (message.direction !== "INBOUND") continue;

		const email = message.fromEmail.trim().toLowerCase();
		mailed(email, message.sentAt);
		let verdict: SenderOutcome["verdict"] = senderVerdict(
			message,
			thread.subject,
			company.domain,
			policy.context,
		);
		const ownerId = message.syncedByUserId;
		if (
			verdict === "create" &&
			(!ownerId || !policy.creatingOwners.has(ownerId))
		) {
			verdict = "policy-off";
		}

		const seen = senders.get(email);
		if (seen && rank(verdict) <= rank(seen.verdict)) continue;

		senders.set(email, {
			email,
			name: message.fromName?.trim() || seen?.name || null,
			domain: workDomain(email),
			verdict,
			ownerId: verdict === "create" ? ownerId : null,
			lastMailAt: message.sentAt,
		});
	}

	return {
		skip: null,
		companyId: company.id,
		senders: [...senders.values()].map((sender) => ({
			...sender,
			lastMailAt: lastMail.get(sender.email) ?? sender.lastMailAt,
		})),
	};
}

function rank(verdict: SenderOutcome["verdict"]): number {
	if (verdict === "create") return 2;
	if (verdict === "policy-off") return 1;
	return 0;
}
