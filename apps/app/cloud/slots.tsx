import { CHECKOUT } from "@/lib/checkout-config";

export { UsageAddOns } from "@/app/(app)/[slug]/settings/ai/usage-add-ons";
export {
	longDay,
	PlanPicker,
} from "@/app/(app)/[slug]/settings/billing/billing";
export { CheckoutBanner, CheckoutButton } from "@/components/checkout-banner";
export { CheckoutOutcome } from "@/components/checkout-outcome";
export { type CheckoutNotice, checkoutNotice } from "@/lib/checkout-notice";

export const BILLING_SETTINGS_NAV = [
	{
		title: "Plan & billing",
		href: CHECKOUT.billingPath,
		hosted: true,
		admin: true,
		group: "plan",
	},
] as const;
