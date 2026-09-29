import type {
	MarketingLlms,
	MarketingNav,
	MarketingSitemap,
	SettingsNavSlot,
} from "@/cloud/contract";
import { CHECKOUT } from "@/lib/checkout-config";

export { landingMarkdown } from "@/lib/landing-markdown";

export const BILLING_SETTINGS_NAV: readonly SettingsNavSlot[] = [
	{
		title: "Plan & billing",
		href: CHECKOUT.billingPath,
		hosted: true,
		admin: true,
		group: "plan",
	},
];

export const MARKETING_NAV: MarketingNav = {
	pricing: { path: "/pricing", label: "Pricing" },
	selfHosted: { path: "/self-hosted-crm", label: "Self-hosted CRM" },
	reading: [
		{ path: "/self-hosted-crm", label: "Self-hosted CRM" },
		{ path: "/open-source-crm", label: "Open source CRM" },
		{ path: "/vs/hubspot", label: "Reloop vs HubSpot" },
		{ path: "/win-back-customers", label: "Win back customers" },
		{ path: "/open-source", label: "Open source" },
	],
	company: [{ path: "/about", label: "About Reloop CRM" }],
};

export const MARKETING_SITEMAP: MarketingSitemap = {
	lead: ["/pricing"],
	rest: [
		"/open-source",
		"/about",
		"/open-source-crm",
		"/self-hosted-crm",
		"/vs/hubspot",
		"/win-back-customers",
	],
};

export const MARKETING_LLMS: MarketingLlms = {
	lead: [
		{
			title: "Pricing",
			path: "/pricing",
			note: "The plans, what each includes, and the 14 day trial.",
		},
	],
	rest: [
		{
			title: "Open source",
			path: "/open-source",
			note: "The AGPL-3.0 licence Reloop CRM ships under.",
		},
		{
			title: "What an open source CRM gives you",
			path: "/open-source-crm",
			note: "Why the source and the data stay yours.",
		},
		{
			title: "Self-hosted CRM",
			path: "/self-hosted-crm",
			note: "Install Reloop CRM on your own server with one command, and what the server needs.",
		},
		{
			title: "Reloop CRM vs HubSpot",
			path: "/vs/hubspot",
			note: "What HubSpot does better, and what Reloop CRM does better.",
		},
		{
			title: "Win back customers",
			path: "/win-back-customers",
			note: "How Reloop CRM finds the customers who went quiet, ranks them, and drafts the mail that brings them back.",
		},
		{
			title: "About",
			path: "/about",
			note: "Who builds Reloop CRM, what it does, and the licence it ships under.",
		},
	],
};
