import {
	minimumFor,
	type QuantityRule,
	type ThreadSignal,
} from "./contact-worth";
import { DealStage } from "./generated/prisma/enums";

export const QUOTE_OUTCOMES = ["QUOTED", "OPEN_OFFER_OURS"] as const;

export type QuoteOutcome = (typeof QUOTE_OUTCOMES)[number];

export const QUOTE_DEAL_STAGE: DealStage = DealStage.CONTRACT_SENT;

export const QUOTE_DEALS = {
	list: { max: 50 },
	scan: { maxRows: 500 },
	thread: { maxAgeDays: 120 },
} as const;

const DAY_MS = 86_400_000;

export function quoteThreadCutoff(now: Date): Date {
	return new Date(now.getTime() - QUOTE_DEALS.thread.maxAgeDays * DAY_MS);
}

export function isQuoteOutcome(outcome: string): outcome is QuoteOutcome {
	return (QUOTE_OUTCOMES as readonly string[]).includes(outcome);
}

export function quoteWorthDeal(
	insight: ThreadSignal,
	rule: QuantityRule,
): boolean {
	if (!insight.relevant) return false;
	if (!isQuoteOutcome(insight.outcome)) return false;
	if (insight.quantityPallets === null) return false;

	return insight.quantityPallets >= minimumFor(insight, rule);
}
