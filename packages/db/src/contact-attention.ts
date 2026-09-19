import type { Db } from "./client";
import {
	type ContactWorthReason,
	contactWorth,
	type QuantityRule,
	type ThreadSignal,
} from "./contact-worth";
import { DealStage } from "./generated/prisma/enums";
import {
	INSIGHT_OUTCOMES,
	INSIGHT_SIDES,
	type InsightOutcome,
	type InsightSide,
} from "./insights";
import {
	type PointLine,
	type ReactivationCandidate,
	readReactivationCandidate,
} from "./reactivation";
import { DEFAULT_WIN_BACK_RULES, type WinBackRuleSet } from "./win-back-rules";

export const ATTENTION = {
	quiet: { days: 90 },
	evidence: { maxChars: 400 },
	chips: { max: 6 },
	points: { maxLines: 14 },
} as const;

export const ATTENTION_KINDS = [
	"nothing-known",
	"win-back",
	"owed",
	"declined",
	"waiting",
	"settled",
	"open",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export type AttentionSource = {
	threadId: string;
	subject: string | null;
	at: string;
};

export type AttentionMoment = {
	at: string;
	threadId: string | null;
};

export type AttentionField =
	| {
			key: "standing";
			standing: string;
			potential: string | null;
			worth: ContactWorthReason | null;
			threadsRead: number;
	  }
	| { key: "outcome"; outcome: InsightOutcome; source: AttentionSource | null }
	| {
			key: "quantity";
			pallets: number | null;
			unit: string;
			loads: number | null;
			source: AttentionSource | null;
	  }
	| { key: "side"; side: InsightSide; source: AttentionSource | null }
	| {
			key: "products" | "asked";
			values: string[];
			source: AttentionSource | null;
	  }
	| {
			key: "task";
			activityId: string;
			subject: string | null;
			dueAt: string | null;
	  }
	| {
			key: "bought";
			dealId: string;
			name: string;
			amountCents: number | null;
			currency: string;
	  };

export type AttentionEvidence = {
	quote: string;
	messageId: string | null;
	source: AttentionSource;
};

export type AttentionPoints = {
	total: number;
	band: string | null;
	lines: PointLine[];
};

export type ContactAttention = {
	kind: AttentionKind;
	name: string | null;
	quietDays: number;
	emails: number;
	firstContactAt: string | null;
	lastInbound: AttentionMoment | null;
	lastOutbound: AttentionMoment | null;
	reply: { email: string | null };
	fields: AttentionField[];
	evidence: AttentionEvidence | null;
	points: AttentionPoints | null;
};

export type AttentionInsight = {
	threadId: string;
	subject: string | null;
	lastMessageAt: Date;
	outcome: string;
	side: string | null;
	unansweredByUs: boolean;
	quantityPallets: number | null;
	loads: number | null;
	products: string[];
	topics: string[];
	evidence: string[];
	evidenceMessageIds: string[];
};

export type AttentionTask = {
	activityId: string;
	subject: string | null;
	dueAt: Date | null;
};

export type AttentionDeal = {
	dealId: string;
	name: string;
	amountCents: number | null;
	currency: string;
};

export type AttentionFacts = {
	candidate: ReactivationCandidate | null;
	insight: AttentionInsight | null;
	unanswered: AttentionInsight | null;
	signals: readonly ThreadSignal[];
	task: AttentionTask | null;
	deal: AttentionDeal | null;
	rule: QuantityRule;
	products: readonly string[];
	unit: string;
};

function outcomeOf(value: string): InsightOutcome {
	return INSIGHT_OUTCOMES.find((entry) => entry === value) ?? "OTHER";
}

function sideOf(value: string | null): InsightSide {
	return INSIGHT_SIDES.find((entry) => entry === value) ?? "UNCLEAR";
}

function sourceOf(insight: AttentionInsight | null): AttentionSource | null {
	if (!insight) return null;

	return {
		threadId: insight.threadId,
		subject: insight.subject,
		at: insight.lastMessageAt.toISOString(),
	};
}

function personName(contact: {
	firstName: string;
	lastName: string | null;
}): string {
	return [contact.firstName, contact.lastName]
		.filter((part) => (part ?? "").trim().length > 0)
		.join(" ");
}

function momentOf(
	at: Date | null,
	threadId: string | null,
): AttentionMoment | null {
	return at === null ? null : { at: at.toISOString(), threadId };
}

function trimmed(values: readonly string[]): string[] {
	const kept: string[] = [];

	for (const value of values) {
		const word = value.trim();
		if (word.length === 0) continue;
		if (kept.includes(word)) continue;
		kept.push(word);
		if (kept.length === ATTENTION.chips.max) break;
	}

	return kept;
}

const QUOTE_MARKS =
	/^[\s"'\u201c\u201d\u201e\u201f\u00ab\u00bb\u2039\u203a\u2018\u2019\u201a]+|[\s"'\u201c\u201d\u201e\u201f\u00ab\u00bb\u2039\u203a\u2018\u2019\u201a]+$/g;

export function unquoted(value: string): string {
	return value.replace(QUOTE_MARKS, "");
}

function quote(
	values: readonly string[],
	messageIds: readonly string[],
): { said: string; messageId: string | null } | null {
	const at = values.findIndex((value) => unquoted(value).length > 0);
	if (at === -1) return null;

	const first = unquoted(values[at] ?? "");
	const said =
		first.length > ATTENTION.evidence.maxChars
			? `${first.slice(0, ATTENTION.evidence.maxChars).trimEnd()}…`
			: first;

	const messageId = (messageIds[at] ?? "").trim();

	return { said, messageId: messageId.length > 0 ? messageId : null };
}

function knownNothing(facts: AttentionFacts): boolean {
	if (facts.candidate === null) return true;
	if (facts.insight !== null) return false;

	return facts.signals.every((signal) => !signal.relevant);
}

function quiet(candidate: ReactivationCandidate): boolean {
	return candidate.quietDays >= ATTENTION.quiet.days;
}

function owed(
	candidate: ReactivationCandidate,
	insight: AttentionInsight | null,
): boolean {
	return candidate.waitingOnUs || (insight?.unansweredByUs ?? false);
}

function waiting(outcome: InsightOutcome): boolean {
	return outcome === "OPEN_OFFER_OURS" || outcome === "QUOTED";
}

export function attentionKindOf(facts: AttentionFacts): AttentionKind {
	if (knownNothing(facts)) return "nothing-known";

	const candidate = facts.candidate;
	if (!candidate) return "nothing-known";

	if (quiet(candidate)) return "win-back";
	if (owed(candidate, facts.insight)) return "owed";

	const outcome = outcomeOf(facts.insight?.outcome ?? "OTHER");
	if (outcome === "DECLINED") return "declined";
	if (waiting(outcome)) return "waiting";
	if (outcome === "DEAL_DONE") return "settled";

	return "open";
}

const FIELDS_BY_KIND = {
	"nothing-known": [],
	"win-back": ["bought", "outcome"],
	owed: ["outcome", "asked", "quantity", "products", "side", "standing"],
	declined: ["outcome", "standing"],
	waiting: ["outcome", "quantity", "products", "side", "standing", "task"],
	settled: ["outcome", "bought", "standing"],
	open: ["outcome", "quantity", "products", "side", "standing", "task"],
} as const satisfies Record<AttentionKind, readonly AttentionField["key"][]>;

function fieldFor(
	key: AttentionField["key"],
	facts: AttentionFacts,
): AttentionField | null {
	const source = sourceOf(facts.insight);
	const insight = facts.insight;

	if (key === "standing") {
		const candidate = facts.candidate;
		const standing = candidate?.standing ?? null;
		if (standing === null || !candidate) return null;

		return {
			key,
			standing,
			potential: candidate.potential,
			worth: contactWorth(
				{
					hasDeal: candidate.openDeals + candidate.wonDeals > 0,
					verdict: candidate.feedback,
					insights: facts.signals,
					unreadThreads: 0,
					knownPallets: candidate.memory.maxPallets,
					products: facts.products,
				},
				facts.rule,
			),
			threadsRead: facts.signals.filter((signal) => signal.relevant).length,
		};
	}

	if (key === "outcome") {
		if (!insight) return null;
		const outcome = outcomeOf(insight.outcome);
		if (outcome === "OTHER") return null;

		return { key, outcome, source };
	}

	if (key === "quantity") {
		if (!insight) return null;
		if (insight.quantityPallets === null && insight.loads === null) return null;

		return {
			key,
			pallets: insight.quantityPallets,
			unit: facts.unit,
			loads: insight.loads,
			source,
		};
	}

	if (key === "side") {
		if (!insight) return null;
		const side = sideOf(insight.side);
		if (side === "UNCLEAR") return null;

		return { key, side, source };
	}

	if (key === "products") {
		const values = trimmed(insight?.products ?? []);
		if (values.length === 0) return null;

		return { key, values, source };
	}

	if (key === "asked") {
		const values = trimmed(facts.unanswered?.topics ?? []);
		if (values.length === 0) return null;

		return { key, values, source: sourceOf(facts.unanswered) };
	}

	if (key === "task") {
		const task = facts.task;
		if (!task) return null;

		return {
			key,
			activityId: task.activityId,
			subject: task.subject,
			dueAt: task.dueAt?.toISOString() ?? null,
		};
	}

	const deal = facts.deal;
	if (!deal) return null;

	return { key: "bought", ...deal };
}

export function attentionFieldsOf(
	kind: AttentionKind,
	facts: AttentionFacts,
): AttentionField[] {
	const fields: AttentionField[] = [];

	for (const key of FIELDS_BY_KIND[kind]) {
		const field = fieldFor(key, facts);
		if (field) fields.push(field);
	}

	return fields;
}

function evidenceOf(
	kind: AttentionKind,
	facts: AttentionFacts,
): AttentionEvidence | null {
	if (kind === "nothing-known") return null;

	const source = sourceOf(facts.insight);
	const said = quote(
		facts.insight?.evidence ?? [],
		facts.insight?.evidenceMessageIds ?? [],
	);
	if (!source || said === null) return null;

	return { quote: said.said, messageId: said.messageId, source };
}

function pointsOf(
	kind: AttentionKind,
	candidate: ReactivationCandidate | null,
): AttentionPoints | null {
	if (kind !== "win-back" || !candidate) return null;
	if (candidate.pointLines.length === 0) return null;

	return {
		total: candidate.points,
		band: candidate.potential,
		lines: candidate.pointLines.slice(0, ATTENTION.points.maxLines),
	};
}

export function attentionOf(facts: AttentionFacts): ContactAttention {
	const kind = attentionKindOf(facts);
	const candidate = facts.candidate;

	return {
		kind,
		name: candidate ? personName(candidate.contact) : null,
		quietDays: candidate?.quietDays ?? 0,
		emails:
			(candidate?.messagesFromThem ?? 0) + (candidate?.messagesFromUs ?? 0),
		firstContactAt: candidate?.firstContactAt?.toISOString() ?? null,
		lastInbound: momentOf(
			candidate?.lastInboundAt ?? null,
			candidate?.lastInboundThreadId ?? null,
		),
		lastOutbound: momentOf(
			candidate?.lastOutboundAt ?? null,
			candidate?.lastOutboundThreadId ?? null,
		),
		reply: { email: candidate?.contact.email ?? null },
		fields: attentionFieldsOf(kind, facts),
		evidence: evidenceOf(kind, facts),
		points: pointsOf(kind, candidate),
	};
}

type InsightThread = {
	id: string;
	subject: string | null;
	lastMessageAt: Date;
	insight: {
		outcome: string;
		side: string | null;
		unansweredByUs: boolean;
		quantityPallets: number | null;
		loads: number | null;
		products: string[];
		topics: string[];
		evidence: string[];
		evidenceMessageIds: string[];
	} | null;
};

function insightOf(thread: InsightThread | null): AttentionInsight | null {
	if (!thread?.insight) return null;

	return {
		threadId: thread.id,
		subject: thread.subject,
		lastMessageAt: thread.lastMessageAt,
		...thread.insight,
	};
}

function newestReadThread(db: Db, contactId: string, unanswered: boolean) {
	return db.emailThread.findFirst({
		where: {
			contactId,
			insight: unanswered
				? { relevant: true, unansweredByUs: true }
				: { relevant: true },
		},
		orderBy: { lastMessageAt: "desc" },
		select: {
			id: true,
			subject: true,
			lastMessageAt: true,
			insight: {
				select: {
					outcome: true,
					side: true,
					unansweredByUs: true,
					quantityPallets: true,
					loads: true,
					products: true,
					topics: true,
					evidence: true,
					evidenceMessageIds: true,
				},
			},
		},
	});
}

export async function readContactAttention(
	db: Db,
	options: { contactId: string; now?: Date; rules?: WinBackRuleSet },
): Promise<ContactAttention> {
	const now = options.now ?? new Date();
	const rules = options.rules ?? DEFAULT_WIN_BACK_RULES;
	const contactId = options.contactId;

	const [candidate, thread, unanswered, signals, task, deal] =
		await Promise.all([
			readReactivationCandidate(db, { contactId, now, rules }),
			newestReadThread(db, contactId, false),
			newestReadThread(db, contactId, true),
			db.threadInsight.findMany({
				where: { thread: { contactId } },
				select: {
					relevant: true,
					outcome: true,
					quantityPallets: true,
					unansweredByUs: true,
					products: true,
					topics: true,
				},
			}),
			db.activity.findFirst({
				where: { contactId, type: "TASK", completedAt: null },
				orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
				select: { id: true, subject: true, dueAt: true },
			}),
			db.deal.findFirst({
				where: {
					archivedAt: null,
					stage: DealStage.CLOSED_WON,
					contacts: { some: { contactId } },
				},
				orderBy: { updatedAt: "desc" },
				select: { id: true, name: true, amount: true, currency: true },
			}),
		]);

	return attentionOf({
		candidate,
		signals,
		rule: {
			minPallets: rules.business.minPallets,
			minBoxes: rules.business.minBoxes,
			boxProducts: rules.business.boxProducts,
		},
		products: rules.business.products,
		unit: rules.business.unit,
		insight: insightOf(thread),
		unanswered: insightOf(unanswered),
		task: task
			? { activityId: task.id, subject: task.subject, dueAt: task.dueAt }
			: null,
		deal: deal
			? {
					dealId: deal.id,
					name: deal.name,
					amountCents:
						deal.amount === null ? null : deal.amount.times(100).toNumber(),
					currency: deal.currency,
				}
			: null,
	});
}
