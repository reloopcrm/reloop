import type { PlanId } from "@crm/db/plans";
import { PRICING_EUR } from "@crm/db/pricing";

export type PlanLimit =
	| { label: string; count: number }
	| { label: string; text: string };

export type Plan = {
	id: PlanId;
	name: string;
	tagline: string;
	monthly: number;
	yearly: number;
	popular?: boolean;
	limits: readonly PlanLimit[];
};

export const PRICING = {
	href: {
		pricing: "/pricing",
		start: "/get-started",
		planParam: "plan",
		selfHosted: "/self-hosted-crm",
	},
	yearlyDiscountPercent: PRICING_EUR.yearlyDiscountPercent,
	included: [
		{
			id: "start",
			name: "Start",
			tagline: "For two people with one mailbox",
			monthly: PRICING_EUR.plans.start.monthly,
			yearly: PRICING_EUR.plans.start.yearly,
			limits: [
				{ label: "Seats", text: "Unlimited" },
				{ label: "Mailboxes", count: 1 },
				{ label: "Conversations", count: 1000 },
				{ label: "Drafts", count: 40 },
				{ label: "Contacts", count: 10000 },
			],
		},
		{
			id: "standard",
			name: "Standard",
			tagline: "For most businesses",
			monthly: PRICING_EUR.plans.standard.monthly,
			yearly: PRICING_EUR.plans.standard.yearly,
			popular: true,
			limits: [
				{ label: "Seats", text: "Unlimited" },
				{ label: "Mailboxes", count: 1 },
				{ label: "Conversations", count: 3000 },
				{ label: "Drafts", count: 100 },
				{ label: "Contacts", count: 25000 },
			],
		},
		{
			id: "plus",
			name: "Plus",
			tagline: "Two mailboxes, more mail",
			monthly: PRICING_EUR.plans.plus.monthly,
			yearly: PRICING_EUR.plans.plus.yearly,
			limits: [
				{ label: "Seats", text: "Unlimited" },
				{ label: "Mailboxes", count: 2 },
				{ label: "Conversations", count: 7000 },
				{ label: "Drafts", count: 300 },
				{ label: "Contacts", count: 50000 },
			],
		},
		{
			id: "team",
			name: "Team",
			tagline: "Several departments",
			monthly: PRICING_EUR.plans.team.monthly,
			yearly: PRICING_EUR.plans.team.yearly,
			limits: [
				{ label: "Seats", text: "Unlimited" },
				{ label: "Mailboxes", count: 4 },
				{ label: "Conversations", count: 18000 },
				{ label: "Drafts", count: 800 },
				{ label: "Contacts", count: 150000 },
			],
		},
		{
			id: "office",
			name: "Office",
			tagline: "Large business",
			monthly: PRICING_EUR.plans.office.monthly,
			yearly: PRICING_EUR.plans.office.yearly,
			limits: [
				{ label: "Seats", text: "Unlimited" },
				{ label: "Mailboxes", count: 8 },
				{ label: "Conversations", count: 45000 },
				{ label: "Drafts", count: 2000 },
				{ label: "Contacts", count: 500000 },
			],
		},
	],
	ownKey: [
		{
			id: "hosting",
			name: "Hosting",
			tagline: "From one seat, no minimum",
			monthly: PRICING_EUR.plans.hosting.monthly,
			yearly: PRICING_EUR.plans.hosting.yearly,
			limits: [
				{ label: "Mailboxes", count: 2 },
				{ label: "Contacts", count: 10000 },
				{ label: "Storage", text: "5 GB" },
				{ label: "AI", text: "Unlimited" },
				{ label: "Support", text: "Email" },
			],
		},
		{
			id: "hosting-pro",
			name: "Hosting Pro",
			tagline: "More mailboxes, priority support",
			monthly: PRICING_EUR.plans["hosting-pro"].monthly,
			yearly: PRICING_EUR.plans["hosting-pro"].yearly,
			limits: [
				{ label: "Mailboxes", count: 6 },
				{ label: "Contacts", count: 50000 },
				{ label: "Storage", text: "25 GB" },
				{ label: "AI", text: "Unlimited" },
				{ label: "Support", text: "With priority" },
			],
		},
	],
	addOns: [
		{
			label: PRICING_EUR.addOns.conversations.label,
			price: PRICING_EUR.addOns.conversations.monthly,
		},
		{
			label: PRICING_EUR.addOns.drafts.label,
			price: PRICING_EUR.addOns.drafts.monthly,
		},
		{
			label: PRICING_EUR.addOns.research.label,
			price: PRICING_EUR.addOns.research.monthly,
		},
		{
			label: PRICING_EUR.addOns.mailbox.label,
			price: PRICING_EUR.addOns.mailbox.monthly,
		},
	],
} as const satisfies {
	href: Record<string, string>;
	yearlyDiscountPercent: number;
	included: readonly Plan[];
	ownKey: readonly Plan[];
	addOns: readonly { label: string; price: number }[];
};
