import { Link } from "@crm/ui/components/link";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { CopyCode } from "@/components/copy-command";
import { type SiteTone, Square } from "@/components/site/eyebrow";
import { SITE_TYPE } from "@/components/site/typography";

export type Block =
	| { kind: "heading"; level: number; text: string }
	| { kind: "code"; text: string }
	| { kind: "callout"; tone: CalloutTone; text: string }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "table"; rows: string[][] }
	| { kind: "paragraph"; text: string };

export type DocHeading = { id: string; title: string };

const CALLOUT_TONES = [
	"note",
	"tip",
	"important",
	"warning",
	"caution",
] as const;

export type CalloutTone = (typeof CALLOUT_TONES)[number];

const CALLOUT_TONE = {
	note: "blue",
	tip: "blue",
	important: "ink",
	warning: "orange",
	caution: "red",
} as const satisfies Record<CalloutTone, SiteTone>;

const ALERT = /^\[!([a-z]+)\]$/i;

const LIST_ITEM = /^\s*(?:([-*])|\d+\.)\s+(.*)$/;

const CONTINUATION = /^\s+\S/;

const BLOCK_START = /^(#{1,6}\s|```|\||>|\s*(?:[-*]|\d+\.)\s)/;

const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*/g;

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function callout(quote: string[]): Block {
	const body = quote.map((line) => line.replace(/^>\s?/, "").trim());
	const name = ALERT.exec(body[0] ?? "")?.[1]?.toLowerCase();
	const alert = CALLOUT_TONES.find((tone) => tone === name);
	return {
		kind: "callout",
		tone: alert ?? "note",
		text: (alert ? body.slice(1) : body).filter(Boolean).join(" "),
	};
}

export function parseMarkdown(source: string): Block[] {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? "";

		if (line.startsWith("```")) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
				body.push(lines[i] ?? "");
				i++;
			}
			i++;
			blocks.push({ kind: "code", text: body.join("\n") });
			continue;
		}

		if (line.startsWith(">")) {
			const quote: string[] = [];
			while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
				quote.push(lines[i] ?? "");
				i++;
			}
			blocks.push(callout(quote));
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			blocks.push({
				kind: "heading",
				level: (heading[1] ?? "").length,
				text: (heading[2] ?? "").trim(),
			});
			i++;
			continue;
		}

		if (line.trimStart().startsWith("|")) {
			const rows: string[][] = [];
			while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) {
				const row = (lines[i] ?? "").trim();
				if (!TABLE_DIVIDER.test(row)) {
					rows.push(
						row
							.replace(/^\||\|$/g, "")
							.split("|")
							.map((cell) => cell.trim()),
					);
				}
				i++;
			}
			blocks.push({ kind: "table", rows });
			continue;
		}

		const first = LIST_ITEM.exec(line);
		if (first) {
			const items: string[] = [];
			let item = first;
			while (item) {
				let text = item[2] ?? "";
				i++;
				while (
					i < lines.length &&
					CONTINUATION.test(lines[i] ?? "") &&
					!LIST_ITEM.test(lines[i] ?? "")
				) {
					text += ` ${(lines[i] ?? "").trim()}`;
					i++;
				}
				items.push(text);
				item = LIST_ITEM.exec(lines[i] ?? "") as RegExpExecArray;
			}
			blocks.push({ kind: "list", ordered: !first[1], items });
			continue;
		}

		if (!line.trim()) {
			i++;
			continue;
		}

		const text: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? "").trim() &&
			!BLOCK_START.test(lines[i] ?? "")
		) {
			text.push((lines[i] ?? "").trim());
			i++;
		}
		blocks.push({ kind: "paragraph", text: text.join(" ") });
	}

	return blocks;
}

export function outline(blocks: Block[]): DocHeading[] {
	return blocks.flatMap((block) =>
		block.kind === "heading" && block.level === 2
			? [{ id: slugify(block.text), title: block.text.replace(/[`*]/g, "") }]
			: [],
	);
}

function headingId(block: Block, id: string): boolean {
	return block.kind === "heading" && slugify(block.text) === id;
}

export function sliceBlocks(
	blocks: Block[],
	from: string,
	to?: string,
): Block[] {
	const start = blocks.findIndex((block) => headingId(block, from));
	if (start < 0) return [];
	const rest = blocks.slice(start + 1);
	const end = to ? rest.findIndex((block) => headingId(block, to)) : -1;
	const slice = end < 0 ? rest : rest.slice(0, end);
	const levels = slice.flatMap((block) =>
		block.kind === "heading" ? [block.level] : [],
	);
	const shift = levels.length ? 2 - Math.min(...levels) : 0;
	return shift
		? slice.map((block) =>
				block.kind === "heading"
					? { ...block, level: block.level + shift }
					: block,
			)
		: slice;
}

const INLINE_CODE =
	"wrap-anywhere rounded-(--site-radius) border border-border bg-(--tile) px-1.25 py-px font-mono text-(length:--site-text-code) text-foreground";

const ARTICLE =
	"mt-12 text-(--ink-80) text-(length:--site-text-body) leading-[1.6] [&>*+*]:mt-4 [&>h2]:mt-12 [&>h3]:mt-8 [&>h2+*]:mt-4 [&>h3+*]:mt-4 [&_a]:text-foreground [&_a]:underline-offset-3 max-[900px]:mt-9 max-[900px]:[&>h2]:mt-10";

function safeHref(href: string): string | null {
	return /^(https?:\/\/|\/|#)/.test(href) ? href : null;
}

function inline(text: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	let last = 0;

	for (const match of text.matchAll(INLINE)) {
		const at = match.index ?? 0;
		if (at > last) nodes.push(text.slice(last, at));

		const [whole, code, label, href, bold, italic] = match;
		if (code !== undefined) {
			nodes.push(
				<code key={at} className={INLINE_CODE}>
					{code}
				</code>,
			);
		} else if (label !== undefined) {
			const target = safeHref(href ?? "");
			nodes.push(
				target ? (
					<Link key={at} href={target}>
						{label}
					</Link>
				) : (
					label
				),
			);
		} else if (bold !== undefined) {
			nodes.push(
				<strong
					key={at}
					className="font-(--site-weight-medium) text-foreground"
				>
					{inline(bold)}
				</strong>,
			);
		} else {
			nodes.push(<em key={at}>{italic}</em>);
		}

		last = at + whole.length;
	}

	if (last < text.length) nodes.push(text.slice(last));

	return nodes;
}

export function Markdown({ source }: { source: string }) {
	return <MarkdownBlocks blocks={parseMarkdown(source)} />;
}

export function MarkdownBlocks({
	blocks,
	children,
}: {
	blocks: Block[];
	children?: React.ReactNode;
}) {
	return (
		<article className={ARTICLE}>
			{blocks.map((block, index) => {
				const key = `${block.kind}-${index}`;

				if (block.kind === "heading") {
					const id = slugify(block.text);
					if (block.level === 1) {
						return (
							<h1 key={key} id={id} className={SITE_TYPE.display2}>
								{inline(block.text)}
							</h1>
						);
					}
					if (block.level === 2) {
						return (
							<h2
								key={key}
								id={id}
								className={cn(SITE_TYPE.title24, "text-foreground")}
							>
								{inline(block.text)}
							</h2>
						);
					}
					return (
						<h3
							key={key}
							id={id}
							className={cn(SITE_TYPE.title20, "text-foreground")}
						>
							{inline(block.text)}
						</h3>
					);
				}

				if (block.kind === "code") {
					return (
						<div
							key={key}
							className="relative border border-border bg-(--tile)"
						>
							<pre className="overflow-x-auto py-5 ps-5 pe-24 font-mono noscript:pe-5 max-[900px]:p-4 text-(length:--site-text-code) text-foreground leading-[1.6] [tab-size:4]">
								<code>{block.text}</code>
							</pre>
							<CopyCode code={block.text} />
						</div>
					);
				}

				if (block.kind === "callout") {
					return (
						<div
							key={key}
							className="grid grid-cols-[--spacing(2)_1fr] items-start gap-4 border border-border bg-(--off) py-5 ps-5 pe-6 max-[900px]:gap-3 max-[900px]:p-4"
						>
							<span className="mt-2 flex">
								<Square tone={CALLOUT_TONE[block.tone]} />
							</span>
							<p className="text-foreground">{inline(block.text)}</p>
						</div>
					);
				}

				if (block.kind === "table") {
					const [head = [], ...body] = block.rows;
					return (
						<Table key={key} containerClassName="border">
							<TableHeader>
								<TableRow>
									{head.map((cell, cellIndex) => (
										<TableHead key={`${key}-h${cellIndex}`}>
											{inline(cell)}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{body.map((row, rowIndex) => (
									<TableRow key={`${key}-r${rowIndex}`}>
										{row.map((cell, cellIndex) => (
											<TableCell
												key={`${key}-r${rowIndex}c${cellIndex}`}
												className="whitespace-normal"
											>
												{inline(cell)}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					);
				}

				if (block.kind === "list") {
					const items = block.items.map((item, itemIndex) => (
						<li key={`${key}-${itemIndex}`}>{inline(item)}</li>
					));
					const list = "flex flex-col gap-2 ps-5.5 marker:text-(--ink-50)";
					return block.ordered ? (
						<ol key={key} className={cn(list, "list-decimal")}>
							{items}
						</ol>
					) : (
						<ul key={key} className={cn(list, "list-disc")}>
							{items}
						</ul>
					);
				}

				return <p key={key}>{inline(block.text)}</p>;
			})}
			{children}
		</article>
	);
}
