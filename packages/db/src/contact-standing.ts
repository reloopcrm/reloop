import {
	type ContactSignals,
	mentionsProduct,
	minimumFor,
	type QuantityRule,
	type ThreadSignal,
} from "./contact-worth";
import type { InsightOutcome, PotentialVerdict } from "./insights";

export const CONTACT_STANDING = {
	customer: "customer",
	interested: "interested",
	watch: "watch",
} as const;

export type ContactStanding =
	(typeof CONTACT_STANDING)[keyof typeof CONTACT_STANDING];

export const CONTACT_POTENTIAL = {
	high: "high",
	medium: "medium",
	low: "low",
} as const;

export type ContactPotential =
	(typeof CONTACT_POTENTIAL)[keyof typeof CONTACT_POTENTIAL];

export const CONTACT_STANDING_RULE = {
	potential: { highQuantityFactor: 3, highInquiries: 3, mediumInquiries: 2 },
} as const;

export type ContactStandingResult = {
	standing: ContactStanding;
	potential: ContactPotential;
};

const OUTCOME = {
	dealDone: "DEAL_DONE",
	inquiry: "OPEN_INQUIRY_THEIRS",
} as const satisfies Record<string, InsightOutcome>;

const GOOD: PotentialVerdict = "good";

type StandingFacts = {
	business: boolean;
	quantityKnown: boolean;
	enough: boolean;
	big: boolean;
	inquiries: number;
	good: boolean;
};

function quantityReach(
	insights: readonly ThreadSignal[],
	knownPallets: number | null,
	rule: QuantityRule,
	factor: number,
): boolean {
	let seen = false;
	let reached = false;

	for (const insight of insights) {
		const quantity = insight.quantityPallets;
		if (quantity === null) continue;

		seen = true;
		if (quantity >= minimumFor(insight, rule) * factor) reached = true;
	}

	if (seen) return reached;
	if (knownPallets === null) return false;

	return knownPallets >= rule.minPallets * factor;
}

function inquiryCount(
	insights: readonly ThreadSignal[],
	products: readonly string[],
): number {
	return insights.filter(
		(insight) =>
			(insight.outcome === OUTCOME.inquiry || insight.unansweredByUs) &&
			mentionsProduct(insight, products),
	).length;
}

function factsOf(signals: ContactSignals, rule: QuantityRule): StandingFacts {
	const relevant = signals.insights.filter((insight) => insight.relevant);
	const known = signals.knownPallets ?? null;

	return {
		business:
			signals.hasDeal ||
			relevant.some((insight) => insight.outcome === OUTCOME.dealDone),
		quantityKnown:
			known !== null ||
			relevant.some((insight) => insight.quantityPallets !== null),
		enough: quantityReach(relevant, known, rule, 1),
		big: quantityReach(
			relevant,
			known,
			rule,
			CONTACT_STANDING_RULE.potential.highQuantityFactor,
		),
		inquiries: inquiryCount(relevant, signals.products ?? []),
		good: signals.verdict === GOOD,
	};
}

function keeps(facts: StandingFacts): boolean {
	if (facts.good || facts.business) return true;
	if (facts.quantityKnown) return facts.enough;

	return facts.inquiries > 0;
}

function standingFrom(facts: StandingFacts): ContactStanding {
	if (facts.business) return CONTACT_STANDING.customer;

	return keeps(facts) ? CONTACT_STANDING.interested : CONTACT_STANDING.watch;
}

function potentialFrom(facts: StandingFacts): ContactPotential {
	if (!keeps(facts)) return CONTACT_POTENTIAL.low;

	const high =
		facts.business ||
		facts.big ||
		facts.inquiries >= CONTACT_STANDING_RULE.potential.highInquiries;
	if (high) return CONTACT_POTENTIAL.high;

	const medium =
		facts.enough ||
		facts.good ||
		facts.inquiries >= CONTACT_STANDING_RULE.potential.mediumInquiries;

	return medium ? CONTACT_POTENTIAL.medium : CONTACT_POTENTIAL.low;
}

export function standingOf(
	signals: ContactSignals,
	rule: QuantityRule,
): ContactStandingResult {
	const facts = factsOf(signals, rule);

	return { standing: standingFrom(facts), potential: potentialFrom(facts) };
}
