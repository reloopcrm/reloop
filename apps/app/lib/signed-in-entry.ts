import type { BillingInterval, PlanPurchase } from "@crm/db/pricing";
import type { SignedInEntry } from "@/components/landing/signed-in-panel";
import { CHECKOUT } from "@/lib/checkout-config";
import { purchaseQuery } from "@/lib/site-links";
import { workspaceUrl } from "@/lib/workspace-url";

export type Subscription = {
	plan: string | null;
	interval: BillingInterval | null;
};

export function signedInEntry({
	purchase,
	admin,
	subscription,
	slug,
}: {
	purchase: PlanPurchase | null;
	admin: boolean;
	subscription: Subscription | null;
	slug: string;
}): SignedInEntry {
	if (!purchase) return { kind: "workspace" };
	if (!admin) return { kind: "refused" };
	if (!subscription) return { kind: "checkout", purchase };
	if (
		subscription.plan === purchase.plan &&
		subscription.interval === purchase.interval
	)
		return { kind: "owned", purchase };
	return {
		kind: "change",
		href: workspaceUrl(
			slug,
			`${CHECKOUT.billingPath}?${purchaseQuery(purchase)}`,
		),
	};
}
