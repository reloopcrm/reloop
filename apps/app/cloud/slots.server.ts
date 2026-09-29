export { landingMarkdown } from "@/lib/landing-markdown";

export const MARKETING_SITEMAP_PAGES = [
	"/pricing",
	"/open-source",
	"/about",
	"/open-source-crm",
	"/self-hosted-crm",
	"/vs/hubspot",
	"/win-back-customers",
] as const;

export const MARKETING_LLMS_PAGES = [
	{
		title: "Pricing",
		path: "/pricing",
		note: "The plans, what each includes, and the 14 day trial.",
	},
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
] as const;
