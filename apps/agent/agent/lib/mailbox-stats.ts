import { db } from "@crm/db";
import { isFreeEmailDomain } from "@crm/db/email-domains";
import { MEMORY } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	type MailboxProfile,
	readMailboxProfile,
} from "@crm/validation/mailbox-profile";
import { MAILBOX_PROFILE } from "./mailbox-config";
import { untrusted } from "./untrusted";

export type SenderKind = "freemail" | "role" | "work";

export type CounterpartKinds = Pick<
	MailboxProfile["counterparts"],
	"freemail" | "roleAddresses"
>;

type Tally = { senders: number; answered: number };

export type MailboxStats = {
	threads: number;
	outboundThreads: number;
	senders: Record<SenderKind, Tally>;
	insights: { quantities: number; loads: number; amounts: number };
};

export type MailSample = {
	transcript: string;
	outbound: string[];
};

const ROLE_PARTS: ReadonlySet<string> = new Set(MAILBOX_PROFILE.roleLocalParts);

export function senderKind(email: string): SenderKind {
	const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
	if (isFreeEmailDomain(domain)) return "freemail";
	return ROLE_PARTS.has(local) ? "role" : "work";
}

export async function currentMailboxProfile(): Promise<MailboxProfile | null> {
	const read = await readMailboxProfile(db);
	if (!read) return null;
	if (read.ok) return read.profile;

	console.error(
		`[agent] the stored mailbox profile cannot be read: ${read.reason}`,
	);
	return null;
}

export async function recentThreadIds(): Promise<string[]> {
	const rows = await db.emailThread.findMany({
		orderBy: { lastMessageAt: "desc" },
		take: MAILBOX_PROFILE.stats.recentThreads,
		select: { id: true },
	});
	return rows.map((row) => row.id);
}

export async function mailboxStats(threadIds: string[]): Promise<MailboxStats> {
	const inThreads = { threadId: { in: threadIds } };
	const [rows, outboundThreads, quantities, loads, amounts] = await Promise.all(
		[
			db.$queryRaw<{ sender: string; answered: boolean }[]>`
				SELECT lower(m."fromEmail") AS sender,
					bool_or(EXISTS (
						SELECT 1 FROM "emailMessage" o
						WHERE o."threadId" = m."threadId" AND o.direction = 'OUTBOUND'
					)) AS answered
				FROM "emailMessage" m
				WHERE m.direction = 'INBOUND' AND m."threadId" = ANY(${threadIds})
				GROUP BY 1`,
			db.emailThread.count({
				where: {
					id: { in: threadIds },
					messages: { some: { direction: "OUTBOUND" } },
				},
			}),
			db.threadInsight.count({
				where: { ...inThreads, quantityPallets: { gt: 0 } },
			}),
			db.threadInsight.count({ where: { ...inThreads, loads: { gt: 0 } } }),
			db.threadInsight.count({
				where: { ...inThreads, amount: { not: null } },
			}),
		],
	);

	const senders = {
		freemail: { senders: 0, answered: 0 },
		role: { senders: 0, answered: 0 },
		work: { senders: 0, answered: 0 },
	} satisfies MailboxStats["senders"];
	for (const row of rows) {
		const tally = senders[senderKind(row.sender)];
		tally.senders += 1;
		if (row.answered) tally.answered += 1;
	}

	return {
		threads: threadIds.length,
		outboundThreads,
		senders,
		insights: { quantities, loads, amounts },
	};
}

function frequency(count: number, total: number): "common" | "rare" {
	const { commonShare, commonMinSenders } = MAILBOX_PROFILE.stats;
	return count >= commonMinSenders && count / total >= commonShare
		? "common"
		: "rare";
}

export function counterpartKinds(stats: MailboxStats): CounterpartKinds {
	const { freemail, role, work } = stats.senders;
	const answered = freemail.answered + role.answered + work.answered;
	const pick = answered > 0 ? "answered" : "senders";
	const total =
		answered > 0 ? answered : freemail.senders + role.senders + work.senders;

	return {
		freemail: frequency(freemail[pick], total),
		roleAddresses: frequency(role[pick], total),
	};
}

export function statsMarkdown(stats: MailboxStats): string {
	const line = (kind: SenderKind, label: string) =>
		`- ${label}: ${stats.senders[kind].senders} senders, ${stats.senders[kind].answered} of them answered by us`;

	return [
		`Mailbox statistics over the ${stats.threads} newest conversations (${stats.outboundThreads} of them contain mail we sent):`,
		line(
			"freemail",
			"private freemail addresses (gmail, gmx, web.de and similar)",
		),
		line("role", "role addresses (info@, sales@, office@ and similar)"),
		line("work", "personal addresses on a company domain"),
		`- earlier readings found a quantity in ${stats.insights.quantities} conversations, bulk loads in ${stats.insights.loads}, a money amount in ${stats.insights.amounts}`,
	].join("\n");
}

function excerpt(message: {
	body: string | null;
	snippet: string | null;
}): string {
	return (message.body ?? message.snippet ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAILBOX_PROFILE.sample.excerptChars);
}

function subjectOf(subject: string | null): string {
	return (subject ?? "(no subject)").slice(
		0,
		MAILBOX_PROFILE.sample.subjectChars,
	);
}

const messageSelect = {
	orderBy: { sentAt: "asc" },
	take: MEMORY.messagesPerThread,
	select: { direction: true, fromEmail: true, body: true, snippet: true },
} as const;

export async function mailSample(threadIds: string[]): Promise<MailSample> {
	const { sample } = MAILBOX_PROFILE;
	const [sent, received] = await Promise.all([
		db.emailThread.findMany({
			where: {
				id: { in: threadIds },
				messages: { some: { direction: "OUTBOUND" } },
			},
			orderBy: { lastMessageAt: "desc" },
			take: sample.sent,
			select: { subject: true, messages: messageSelect },
		}),
		db.emailThread.findMany({
			where: {
				id: { in: threadIds },
				messages: { none: { direction: "OUTBOUND" } },
				OR: [{ insight: null }, { insight: { relevant: true } }],
			},
			orderBy: { lastMessageAt: "desc" },
			take: sample.receivedPool,
			select: { subject: true, messages: { ...messageSelect, take: 1 } },
		}),
	]);

	const outbound: string[] = [];
	const sentLines = sent.flatMap((thread) => {
		const ours = thread.messages.find(
			(message) => message.direction === "OUTBOUND",
		);
		const theirs = thread.messages.find(
			(message) => message.direction === "INBOUND",
		);
		const text = ours ? excerpt(ours) : "";
		if (!text) return [];
		outbound.push(text);

		const opened = thread.messages[0]?.direction === "OUTBOUND";
		const counterpart = theirs ? senderKind(theirs.fromEmail) : "no answer yet";
		return [
			`- [WE ${opened ? "WROTE FIRST" : "REPLIED"} | counterpart: ${counterpart}] ${untrusted(subjectOf(thread.subject))}\n  ours: ${untrusted(text)}`,
		];
	});

	const taken = { freemail: 0, role: 0, work: 0 } satisfies Record<
		SenderKind,
		number
	>;
	const total =
		sample.received.freemail + sample.received.role + sample.received.work;
	const picked: string[] = [];
	const spare: string[] = [];
	for (const thread of received) {
		const first = thread.messages[0];
		const text = first ? excerpt(first) : "";
		if (!first || !text) continue;

		const kind = senderKind(first.fromEmail);
		const line = `- [THEY WROTE, NO REPLY FROM US | sender: ${kind}] ${untrusted(subjectOf(thread.subject))}\n  theirs: ${untrusted(text)}`;
		if (taken[kind] < sample.received[kind]) {
			taken[kind] += 1;
			picked.push(line);
		} else {
			spare.push(line);
		}
	}
	const receivedLines = [
		...picked,
		...spare.slice(0, Math.max(0, total - picked.length)),
	];

	return {
		transcript: [
			`Conversations that contain mail we sent (${sentLines.length}):`,
			...sentLines,
			"",
			`Conversations we received and did not answer (${receivedLines.length}):`,
			...receivedLines,
		].join("\n"),
		outbound,
	};
}

export async function outboundSenders(threadIds: string[]): Promise<string[]> {
	const rows = await db.emailMessage.findMany({
		where: { threadId: { in: threadIds }, direction: "OUTBOUND" },
		distinct: ["fromEmail"],
		select: { fromEmail: true },
		take: MAILBOX_PROFILE.ownAddresses.max,
	});

	return [
		...new Set(
			rows
				.map((row) => row.fromEmail.trim().toLowerCase())
				.filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)),
		),
	];
}

export async function recordOwnAddresses(addresses: string[]): Promise<void> {
	if (addresses.length === 0) return;

	await db.$executeRaw`
		UPDATE "appSetting"
		SET "ownAddresses" = (
			"ownAddresses" || ARRAY(
				SELECT fresh FROM unnest(${addresses}::text[]) AS fresh
				WHERE NOT fresh = ANY("ownAddresses")
			)
		)[1:${MAILBOX_PROFILE.ownAddresses.max}::int]
		WHERE id = ${SETTINGS_ID}`;
}
