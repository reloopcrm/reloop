import type { PlanPurchase } from "@crm/db/pricing";
import { CHECKOUT } from "./checkout-config";

export type CheckoutNotice =
	| { kind: "confirming" }
	| { kind: "resume"; wanted: PlanPurchase }
	| null;

export function checkoutNotice(input: {
	outcome: string | string[] | undefined;
	wanted: PlanPurchase | null;
	admin: boolean;
}): CheckoutNotice {
	if (!input.admin) return null;
	if (input.outcome === CHECKOUT.outcome.success) return { kind: "confirming" };
	if (input.wanted) return { kind: "resume", wanted: input.wanted };
	return null;
}
