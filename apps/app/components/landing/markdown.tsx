import { Link } from "@crm/ui/components/link";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import type * as React from "react";

type Block =
	| { kind: "heading"; level: number; text: string }
	| { kind: "code"; text: string }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "table"; rows: string[][] }
	| { kind: "paragraph"; text: string };

const LIST_ITEM = /^\s*(?:([-*])|\d+\.)\s+(.*)$/;

const BLOCK_START = /^(#{1,6}\s|```|\||\s*(?:[-*]|\d+\.)\s)/;

const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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
				items.push(item[2] ?? "");
				i++;
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

function safeHref(href: string): string | null {
	return /^(https?:\/\/|\/|#)/.test(href) ? href : null;
}

function inline(text: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	let last = 0;

	for (const match of text.matchAll(INLINE)) {
		const at = match.index ?? 0;
		if (at > last) nodes.push(text.slice(last, at));

		const [whole, code, label, href, bold] = match;
		if (code !== undefined) {
			nodes.push(
				<code key={at} className="font-mono text-foreground">
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
		} else {
			nodes.push(
				<strong key={at} className="font-medium text-foreground">
					{bold}
				</strong>,
			);
		}

		last = at + whole.length;
	}

	if (last < text.length) nodes.push(text.slice(last));

	return nodes;
}

export function Markdown({ source }: { source: string }) {
	return (
		<article className="flex flex-col gap-4 text-body-foreground text-sm/6">
			{parseMarkdown(source).map((block, index) => {
				const key = `${block.kind}-${index}`;

				if (block.kind === "heading") {
					const id = slugify(block.text);
					if (block.level === 1) {
						return (
							<h1
								key={key}
								id={id}
								className="font-medium text-3xl text-foreground tracking-tight"
							>
								{inline(block.text)}
							</h1>
						);
					}
					if (block.level === 2) {
						return (
							<h2
								key={key}
								id={id}
								className="pt-4 font-medium text-foreground text-xl tracking-tight"
							>
								{inline(block.text)}
							</h2>
						);
					}
					return (
						<h3
							key={key}
							id={id}
							className="font-medium text-base text-foreground"
						>
							{inline(block.text)}
						</h3>
					);
				}

				if (block.kind === "code") {
					return (
						<pre
							key={key}
							className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-muted-foreground text-xs/5"
						>
							<code>{block.text}</code>
						</pre>
					);
				}

				if (block.kind === "table") {
					const [head = [], ...body] = block.rows;
					return (
						<Table key={key}>
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
											<TableCell key={`${key}-r${rowIndex}c${cellIndex}`}>
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
					return block.ordered ? (
						<ol key={key} className="flex list-decimal flex-col gap-1 pl-5">
							{items}
						</ol>
					) : (
						<ul key={key} className="flex list-disc flex-col gap-1 pl-5">
							{items}
						</ul>
					);
				}

				return <p key={key}>{inline(block.text)}</p>;
			})}
		</article>
	);
}
