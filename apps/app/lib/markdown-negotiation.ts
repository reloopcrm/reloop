import { z } from "zod";

const MARKDOWN_TYPE = "text/markdown";

const HTML_TYPE = "text/html";

const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

const pathname = z
	.string()
	.max(120)
	.transform((value) => value.replace(/[^\w\-./]/g, ""))
	.catch("");

type MediaRange = { type: string; quality: number };

function mediaRanges(accept: string): MediaRange[] {
	return accept.split(",").map((entry) => {
		const [type = "", ...parameters] = entry.split(";").map((p) => p.trim());
		const weight = parameters
			.map((parameter) => /^q=(.+)$/i.exec(parameter)?.[1])
			.find((value) => value !== undefined);
		const quality = weight === undefined ? 1 : Number.parseFloat(weight);

		return {
			type: type.toLowerCase(),
			quality: Number.isFinite(quality) ? quality : 0,
		};
	});
}

function qualityOf(ranges: MediaRange[], type: string): number {
	return ranges
		.filter((range) => range.type === type)
		.reduce((best, range) => Math.max(best, range.quality), 0);
}

export function prefersMarkdown(accept: string | null): boolean {
	if (!accept) return false;

	const ranges = mediaRanges(accept);
	const markdown = qualityOf(ranges, MARKDOWN_TYPE);

	if (markdown <= 0) return false;

	return markdown > qualityOf(ranges, HTML_TYPE);
}

export function markdownHeaders(): Headers {
	const headers = new Headers();

	headers.set("content-type", MARKDOWN_CONTENT_TYPE);
	headers.append("vary", "Accept");

	return headers;
}

const LINKS = [
	"- [Documentation](/docs)",
	"- [Get started](/get-started)",
	"- [Sitemap](/sitemap.xml)",
	"- [llms.txt](/llms.txt)",
].join("\n");

export function landingMarkdown(): string {
	return `# Reloop CRM

Win back the customers you already have.

Reloop CRM reads years of mail in your inbox and shows which past customers are worth a call. Open source, on your own server.

## What it does

### It starts in your mailbox

Connect Gmail, Outlook or any IMAP inbox. Every real conversation lands on the right contact and company.

### Contacts stay clean

Newsletters, no-reply addresses and your own colleagues never become contacts. What you delete stays deleted.

### It tells you who to win back

A customer who went quiet shows up with the reason to call again, so you know who to ring first. The ranking needs an AI key of your own.

## Your server. Your data. Your CRM.

Reloop CRM is open source and runs on a server you own.

## Where to go next

${LINKS}
`;
}

export function notFoundMarkdown(path: string): string {
	const asked = pathname.parse(path);

	return `# 404 Not Found

Reloop CRM serves no page at \`${asked}\`. The address is wrong, or the page moved. Nothing was found here.

The documentation lists every guide. The sitemap lists every public page. The llms.txt file lists the same pages for an agent.

## Where to go next

- [Reloop CRM home](/)
${LINKS}
`;
}
