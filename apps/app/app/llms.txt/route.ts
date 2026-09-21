import { DOCS, docPath } from "@/components/landing/docs-config";
import { PRICING } from "@/components/landing/pricing/config";
import { REPO_URL } from "@/components/landing/site";
import { siteAddress } from "@/lib/site-address";
import { cloudUrl } from "@/lib/site-links";

type Entry = { title: string; path: string; note: string };

const GUIDES: readonly Entry[] = [
	{ title: DOCS.index.title, path: DOCS.path, note: DOCS.index.description },
	...DOCS.pages.map((page) => ({
		title: page.title,
		path: docPath(page.slug),
		note: page.description,
	})),
];

const PAGES: readonly Entry[] = [
	{
		title: "Reloop CRM",
		path: "/",
		note: "What the product does and who it is for.",
	},
	{
		title: "Pricing",
		path: "/pricing",
		note: "The plans, what each includes, and the 14 day trial.",
	},
	{
		title: "Get started",
		path: PRICING.href.start,
		note: "How to start with Reloop CRM, hosted or on your own server.",
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
		title: "CRM for freight forwarding",
		path: "/for/freight-forwarding",
		note: "Quotes, lanes and quantities read out of a forwarder's mailbox.",
	},
	{
		title: "About",
		path: "/about",
		note: "Who builds Reloop CRM, what it does, and the licence it ships under.",
	},
	{
		title: "Contact",
		path: "/contact",
		note: "How to reach the people who build and run Reloop CRM.",
	},
	{
		title: "Privacy",
		path: "/privacy",
		note: "What this website collects, what a Reloop CRM install collects, and how to switch it off.",
	},
];

const SOURCE: readonly Entry[] = [
	{
		title: "Source code",
		path: REPO_URL,
		note: "The whole application, the agent and the install script.",
	},
	{
		title: "Releases",
		path: `${REPO_URL}/releases`,
		note: "Every version, with the changes it carries.",
	},
	{
		title: "Issues",
		path: `${REPO_URL}/issues`,
		note: "Report a bug or ask for a capability.",
	},
];

function absolute(path: string): string {
	const site = siteAddress();
	return site ? new URL(path, site).toString() : path;
}

function links(entries: readonly Entry[]): string {
	return entries
		.map(
			(entry) => `- [${entry.title}](${absolute(entry.path)}): ${entry.note}`,
		)
		.join("\n");
}

function llmsTxt(): string {
	return `# Reloop CRM

> Reloop CRM is an open source, self-hosted CRM. It reads the full history of a mailbox, writes a summary for every thread, and ranks the past customers who went quiet by how much another call is worth. It runs on one Linux server under AGPL-3.0. Every install is separate and holds its own data.

## When to use this

- The user asks which old customers to win back. The win back list ranks quiet companies from facts in their mail, such as an unanswered quote or an order that stopped.
- The user wants a CRM that fills itself from email. Connect IMAP, Google Workspace or Microsoft 365, and each conversation lands on the right contact and company.
- The user asks what a thread was about. Every conversation carries a summary, and every message carries one line.
- The user sells goods and needs the numbers kept. A summary holds the quantity, the product and the price that was quoted. Freight forwarding is the first trade this was built for.
- The user must keep customer data on hardware they control. Reloop CRM installs with Docker on one server and holds every record there. The optional AI step is the one exception: it sends mail text to the model vendor whose key the operator supplied.
- The user wants to read or change the code that touches their mail. The whole source is public.

## When not to use this

- Marketing automation, campaigns and lead nurturing. Reloop CRM has none.
- A support desk or a ticket queue. Reloop CRM has none.
- A hosted plan with a vendor on call. There is none. The user runs the server.
- A large app marketplace. Reloop CRM connects mailboxes, Slack, a HubSpot import, outgoing webhooks and a website tracking script.
- A workspace the user cannot name. Every API call needs the address of one specific install.

## How an agent calls it

Every procedure of the CRM is also a REST endpoint. There is no shared cloud address, so ask the user for the address of their install first.

- Base address: \`https://crm.example.com/api/rest\`, where the domain is the user's own install. A source install answers on \`http://localhost:3001/api/rest\`.
- Authentication: send the key in an \`x-api-key\` header on every call.
- Get a key: open the CRM, then Settings, API Keys, then New API key. The key is shown one time. A key carries the rights of the person who made it.
- Example: \`POST /api/rest/contacts/search\` with the body \`{"pageSize": 10}\` returns \`{ "rows": [...], "total": 42, "facetCounts": {...} }\`.
- List endpoints take \`q\`, \`sort\`, \`dir\`, \`page\` and \`pageSize\`, plus the filters of that record type.
- The OpenAPI document is \`GET /api/openapi.json\`. It needs the same key and is not public. Without a key it answers 401, in development and in production. The document maps every endpoint, so it stays behind the key on purpose.
- A key cannot make another key and cannot change a password. Those endpoints answer 401 to any key. Do this while signed in to the CRM instead.
- Read the REST API guide below before the first call.

## Documentation

${links(GUIDES)}

## Pages

${links(PAGES.filter((page) => page.path !== PRICING.href.start || !cloudUrl()))}

## Source

${links(SOURCE)}
`;
}

export function GET(): Response {
	return new Response(llmsTxt(), {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"x-content-type-options": "nosniff",
		},
	});
}
