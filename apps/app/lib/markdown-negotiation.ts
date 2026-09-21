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

Win back old customers.

Reloop reads the mailbox you already have. And tells you which old customers you should call.

## Your mailbox is enough

Connect Gmail, Outlook or any IMAP mailbox. Reloop sends no mail. It reads along, scores every thread point by point and puts a draft in front of you. Sending stays with you.

## 178 old customers. Worth a call.

Measured in one real installation: 13,821 threads read, 15,885 messages, 2,691 people, 2,537 companies. 64.5% of the threads held nothing for the business.

## It reads. You decide.

### Reads only. Never sends.

Reloop has read access only. No mail goes out without you.

### Value, point by point.

Every point stands on its own. You check it yourself.

### A draft, not a send.

Reloop writes the draft. Sending stays with you.

## Try it on your own mailbox.

14 days free, no card. From 39 € a month after that. See the plans at https://reloopcrm.com/pricing.

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
