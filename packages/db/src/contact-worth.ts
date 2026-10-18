import { POTENTIAL_VERDICT } from "./insights";

export const CONTACT_WORTH = {
	deal: "deal",
	verdict: "verdict",
	business: "business",
	quantity: "quantity",
	asked: "asked",
	unread: "unread",
} as const;

export type ContactWorthReason =
	(typeof CONTACT_WORTH)[keyof typeof CONTACT_WORTH];

export type ThreadSignal = {
	relevant: boolean;
	outcome: string;
	quantityPallets: number | null;
	unansweredByUs: boolean;
	products?: readonly string[];
	topics?: readonly string[];
};

export type ContactSignals = {
	hasDeal: boolean;
	verdict: string | null;
	insights: readonly ThreadSignal[];
	unreadThreads: number;
	knownPallets?: number | null;
	products?: readonly string[];
};

export type QuantityRule = {
	minPallets: number;
	minBoxes?: number;
	boxProducts?: readonly string[];
};

export function isBoxThread(
	insight: ThreadSignal,
	boxProducts: readonly string[],
): boolean {
	if (boxProducts.length === 0) return false;

	const words = boxProducts.map((product) => product.toLowerCase());
	const said = [...(insight.products ?? []), ...(insight.topics ?? [])];

	return said.some((entry) => {
		const value = entry.toLowerCase();
		return words.some((word) => value.includes(word) || word.includes(value));
	});
}

export function minimumFor(insight: ThreadSignal, rule: QuantityRule): number {
	const boxes = rule.minBoxes;
	if (boxes === undefined) return rule.minPallets;

	return isBoxThread(insight, rule.boxProducts ?? []) ? boxes : rule.minPallets;
}

export function mentionsProduct(
	insight: ThreadSignal,
	products: readonly string[],
): boolean {
	if (products.length === 0) return true;

	const words = products.map((product) => product.toLowerCase());
	const said = [...(insight.products ?? []), ...(insight.topics ?? [])];

	return said.some((entry) => {
		const value = entry.toLowerCase();
		return words.some((word) => value.includes(word) || word.includes(value));
	});
}

function quantityVerdict(
	insights: readonly ThreadSignal[],
	knownPallets: number | null,
	rule: QuantityRule,
): boolean | null {
	let seen = false;
	let enough = false;

	for (const insight of insights) {
		const quantity = insight.quantityPallets;
		if (quantity === null) continue;

		seen = true;
		if (quantity >= minimumFor(insight, rule)) enough = true;
	}

	if (!seen) {
		if (knownPallets === null) return null;
		return knownPallets >= rule.minPallets;
	}

	return enough;
}

export function contactWorth(
	signals: ContactSignals,
	rule: QuantityRule,
): ContactWorthReason | null {
	if (signals.verdict === POTENTIAL_VERDICT.bad) return null;
	if (
		signals.verdict === POTENTIAL_VERDICT.good ||
		signals.verdict === POTENTIAL_VERDICT.later
	) {
		return CONTACT_WORTH.verdict;
	}

	if (signals.hasDeal) return CONTACT_WORTH.deal;

	const relevant = signals.insights.filter((insight) => insight.relevant);
	if (relevant.some((insight) => insight.outcome === "DEAL_DONE")) {
		return CONTACT_WORTH.business;
	}

	const quantity = quantityVerdict(
		relevant,
		signals.knownPallets ?? null,
		rule,
	);
	if (quantity !== null) return quantity ? CONTACT_WORTH.quantity : null;

	const products = signals.products ?? [];
	const asked = relevant.some(
		(insight) =>
			(insight.outcome === "OPEN_INQUIRY_THEIRS" || insight.unansweredByUs) &&
			mentionsProduct(insight, products),
	);
	if (asked) return CONTACT_WORTH.asked;

	return signals.unreadThreads > 0 ? CONTACT_WORTH.unread : null;
}

export function threadWorthAdopting(
	insight: ThreadSignal | null,
	rule: QuantityRule,
	products: readonly string[] = [],
): boolean {
	if (!insight?.relevant) return false;
	if (insight.outcome === "DEAL_DONE") return true;

	if (insight.quantityPallets !== null) {
		return insight.quantityPallets >= minimumFor(insight, rule);
	}

	const asked =
		insight.outcome === "OPEN_INQUIRY_THEIRS" || insight.unansweredByUs;

	return asked && mentionsProduct(insight, products);
}
