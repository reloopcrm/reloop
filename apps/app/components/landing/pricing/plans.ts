import { PLANS } from "@crm/db/plans";
import { PAID_PLAN_IDS, type PaidPlanId, PRICING_EUR } from "@crm/db/pricing";
import { signUpUrl } from "@/lib/site-links";
import type { PricingPlan } from "./pick-plan";

const PLAN_COPY = {
	start: { tagline: "For one mailbox", support: null, popular: false },
	standard: { tagline: "For most businesses", support: null, popular: true },
	plus: { tagline: "Two mailboxes, more mail", support: null, popular: false },
	team: { tagline: "Several departments", support: null, popular: false },
	office: { tagline: "Large business", support: null, popular: false },
	hosting: {
		tagline: "Your own AI key, we run the rest",
		support: "Email",
		popular: false,
	},
	"hosting-pro": {
		tagline: "More mailboxes, priority support",
		support: "With priority",
		popular: false,
	},
} as const satisfies Record<
	PaidPlanId,
	{ tagline: string; support: string | null; popular: boolean }
>;

export function pricingPlans(): PricingPlan[] {
	return PAID_PLAN_IDS.map((id) => {
		const limits = PLANS[id];
		const price = PRICING_EUR.plans[id];
		const copy = PLAN_COPY[id];
		return {
			id,
			name: limits.label,
			tagline: copy.tagline,
			href: signUpUrl(id),
			monthly: price.monthly,
			yearly: price.yearly,
			aiIncluded: limits.aiIncluded,
			popular: copy.popular,
			mailboxes: limits.mailboxes,
			conversations: limits.insightsPerMonth,
			drafts: limits.draftsPerMonth,
			research: limits.researchPerMonth,
			companyResearch: limits.companyResearch,
			contacts: limits.contacts,
			storageGb: limits.storageGb,
			support: copy.support,
		};
	});
}

export function pricingAddOns() {
	return Object.values(PRICING_EUR.addOns).map((addOn) => ({
		label: addOn.label,
		price: addOn.monthly,
	}));
}
