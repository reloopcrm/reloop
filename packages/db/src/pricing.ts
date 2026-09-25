import { z } from "zod";
import type { AddOnId, PlanId } from "./plans";

export const BILLING_INTERVALS = ["month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type PlanPrice = { monthly: number; yearly: number };

export const PRICING_EUR = {
	currency: "eur",
	yearlyDiscountPercent: 15,
	plans: {
		start: { monthly: 39, yearly: 33 },
		standard: { monthly: 79, yearly: 67 },
		plus: { monthly: 149, yearly: 127 },
		team: { monthly: 299, yearly: 254 },
		office: { monthly: 599, yearly: 509 },
		hosting: { monthly: 19, yearly: 16 },
		"hosting-pro": { monthly: 29, yearly: 25 },
	},
	addOns: {
		conversations: { label: "1,000 mail conversations", monthly: 29 },
		drafts: { label: "100 mail drafts", monthly: 19 },
		research: { label: "50 company research runs", monthly: 19 },
		mailbox: { label: "1 extra mailbox per month", monthly: 29 },
	},
	lookup: { prefix: "reloop" },
} as const satisfies {
	currency: string;
	yearlyDiscountPercent: number;
	plans: Record<Exclude<PlanId, "trial">, PlanPrice>;
	addOns: Record<AddOnId, { label: string; monthly: number }>;
	lookup: { prefix: string };
};

export type PaidPlanId = keyof typeof PRICING_EUR.plans;

export const PAID_PLAN_IDS = Object.keys(PRICING_EUR.plans) as PaidPlanId[];

export function isPaidPlanId(value: string): value is PaidPlanId {
	return value in PRICING_EUR.plans;
}

export const planPurchase = z.object({
	plan: z.enum(PAID_PLAN_IDS),
	interval: z.enum(BILLING_INTERVALS),
});

export type PlanPurchase = z.infer<typeof planPurchase>;

export function planLookupKey(plan: PaidPlanId, interval: BillingInterval) {
	return `${PRICING_EUR.lookup.prefix}:plan:${plan}:${interval}`;
}

export function addOnLookupKey(addOn: AddOnId, interval: BillingInterval) {
	return `${PRICING_EUR.lookup.prefix}:addon:${addOn}:${interval}`;
}

export type ParsedLookupKey =
	| { kind: "plan"; plan: PaidPlanId; interval: BillingInterval }
	| { kind: "addon"; addOn: AddOnId; interval: BillingInterval };

export function parseLookupKey(key: string | null): ParsedLookupKey | null {
	const parts = (key ?? "").split(":");
	if (parts[0] !== PRICING_EUR.lookup.prefix) return null;
	if (parts[1] === "plan" && parts[2] && isPaidPlanId(parts[2])) {
		const interval = parts[3] === "year" ? "year" : "month";
		return { kind: "plan", plan: parts[2], interval };
	}
	if (parts[1] === "addon" && parts[2] && parts[2] in PRICING_EUR.addOns) {
		const interval = parts[3] === "year" ? "year" : "month";
		return { kind: "addon", addOn: parts[2] as AddOnId, interval };
	}
	return null;
}

export function yearlyTotal(price: PlanPrice): number {
	return price.yearly * 12;
}

export function addOnYearlyTotal(monthly: number): number {
	return monthly * 12;
}
