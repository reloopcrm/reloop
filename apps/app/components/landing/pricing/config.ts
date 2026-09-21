import type { PlanId } from "@crm/db/plans";

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
		start: "/get-started",
		planParam: "plan",
		selfHosted: "/self-hosted-crm",
	},
	yearlyDiscountPercent: 15,
	included: [
		{
			id: "start",
			name: "Start",
			tagline: "For two people with one mailbox",
			monthly: 39,
			yearly: 33,
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
			monthly: 79,
			yearly: 67,
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
			monthly: 149,
			yearly: 127,
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
			monthly: 299,
			yearly: 254,
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
			monthly: 599,
			yearly: 509,
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
			monthly: 19,
			yearly: 16,
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
			monthly: 29,
			yearly: 25,
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
		{ label: "1,000 mail conversations", price: 29 },
		{ label: "100 mail drafts", price: 19 },
		{ label: "50 company research runs", price: 19 },
		{ label: "1 extra mailbox per month", price: 29 },
		{ label: "50 GB extra storage per month", price: 9 },
	],
} as const satisfies {
	href: Record<string, string>;
	yearlyDiscountPercent: number;
	included: readonly Plan[];
	ownKey: readonly Plan[];
	addOns: readonly { label: string; price: number }[];
};
