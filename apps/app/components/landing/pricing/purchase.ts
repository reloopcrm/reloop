import {
	BILLING_INTERVALS,
	PAID_PLAN_IDS,
	type PlanPurchase,
} from "@crm/db/pricing";
import { z } from "zod";
import { PRICING } from "./config";

type SearchParams = Record<string, string | string[] | undefined>;

const { planParam, intervalParam, buyParam, buyValue } = PRICING.href;

const purchaseParams = z
	.object({
		[planParam]: z.enum(PAID_PLAN_IDS),
		[intervalParam]: z.enum(BILLING_INTERVALS),
		[buyParam]: z.literal(buyValue),
	})
	.transform((params) => ({
		plan: params[planParam],
		interval: params[intervalParam],
	}));

export function purchaseFromParams(params: SearchParams): PlanPurchase | null {
	const parsed = purchaseParams.safeParse(params);
	return parsed.success ? parsed.data : null;
}
