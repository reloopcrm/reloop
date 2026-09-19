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
	source: AttentionSource;
};

export type AttentionPoints = {
	total: number;
	band: string | null;
	lines: PointLine[];
};

export type ContactAttention = {
	kind: AttentionKind;
	quietDays: number;
	emails: number;
	firstContactAt: string | null;
	lastInbound: AttentionMoment | null;
	lastOutbound: AttentionMoment | null;
	reply: { email: string | null; subject: string | null };
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

function quote(values: readonly string[]): string | null {
	const first = values.find((value) => value.trim().length > 0)?.trim();
	if (first === undefined) return null;

	return first.length > ATTENTION.evidence.maxChars
		? `${first.slice(0, ATTENTION.evidence.maxChars).trimEnd()}…`
		: first;
}

function knownNothing(facts: AttentionFacts): boolean {
	if (facts.candidate === null) return true;
	if (facts.insight !== null) return false;

	return facts.candidate.memory.threadsRead === 0;
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
			threadsRead: candidate.memory.threadsRead,
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

	if (key === "products" || key === "asked") {
		const values = trimmed(
			key === "products" ? (insight?.products ?? []) : (insight?.topics ?? []),
		);
		if (values.length === 0) return null;

		return { key, values, source };
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
	const said = quote(facts.insight?.evidence ?? []);
	if (!source || said === null) return null;

	return { quote: said, source };
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
		reply: {
			email: candidate?.contact.email ?? null,
			subject: facts.insight?.subject ?? candidate?.lastSubject ?? null,
		},
		fields: attentionFieldsOf(kind, facts),
		evidence: evidenceOf(kind, facts),
		points: pointsOf(kind, candidate),
	};
}

export async function readContactAttention(
	db: Db,
	options: { contactId: string; now?: Date; rules?: WinBackRuleSet },
): Promise<ContactAttention> {
	const now = options.now ?? new Date();
	const rules = options.rules ?? DEFAULT_WIN_BACK_RULES;
	const contactId = options.contactId;

	const [candidate, thread, signals, task, deal] = await Promise.all([
		readReactivationCandidate(db, { contactId, now, rules }),
		db.emailThread.findFirst({
			where: { contactId, insight: { relevant: true } },
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
					},
				},
			},
		}),
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
		insight: thread?.insight
			? {
					threadId: thread.id,
					subject: thread.subject,
					lastMessageAt: thread.lastMessageAt,
					...thread.insight,
				}
			: null,
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
