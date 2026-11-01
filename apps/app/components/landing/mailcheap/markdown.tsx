import type * as React from "react";
import { type Block, slugify } from "@/components/docs/markdown";
import { CodeFigure } from "./parts";

export type MarkdownLabels = {
	terminal: string;
	copy: string;
	copied: string;
};

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*/g;

function keyed<T>(
	items: readonly T[],
	text: (item: T) => string,
): { item: T; key: string }[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const base = text(item);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return { item, key: count ? `${base}#${count}` : base };
	});
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

		const [whole, code, label, href, bold, italic] = match;
		if (code !== undefined) {
			nodes.push(<code key={at}>{code}</code>);
		} else if (label !== undefined) {
			const target = safeHref(href ?? "");
			nodes.push(
				target ? (
					<a
						key={at}
						href={target}
						target={target.startsWith("http") ? "_blank" : undefined}
						rel={target.startsWith("http") ? "noreferrer" : undefined}
					>
						{label}
					</a>
				) : (
					label
				),
			);
		} else if (bold !== undefined) {
			nodes.push(<b key={at}>{inline(bold)}</b>);
		} else {
			nodes.push(<em key={at}>{italic}</em>);
		}

		last = at + whole.length;
	}

	if (last < text.length) nodes.push(text.slice(last));

	return nodes;
}

export function SiteMarkdown({
	blocks,
	labels,
}: {
	blocks: readonly Block[];
	labels: MarkdownLabels;
}) {
	return (
		<>
			{blocks.map((block, index) => {
				const key = `${block.kind}-${index}`;

				if (block.kind === "heading") {
					const id = slugify(block.text);
					if (block.level === 1)
						return (
							<h1 key={key} id={id}>
								{inline(block.text)}
							</h1>
						);
					if (block.level === 2)
						return (
							<h2 key={key} id={id}>
								{inline(block.text)}
							</h2>
						);
					if (block.level === 3)
						return (
							<h3 key={key} id={id}>
								{inline(block.text)}
							</h3>
						);
					return (
						<h4 key={key} id={id}>
							{inline(block.text)}
						</h4>
					);
				}

				if (block.kind === "code")
					return (
						<CodeFigure
							key={key}
							code={block.text}
							caption={labels.terminal}
							labels={{ copy: labels.copy, copied: labels.copied }}
						/>
					);

				if (block.kind === "callout")
					return (
						<div key={key} className="mc-callout" data-tone={block.tone}>
							<span className="mc-callout-mark" aria-hidden="true" />
							<p>{inline(block.text)}</p>
						</div>
					);

				if (block.kind === "table") {
					const [head = [], ...body] = block.rows;
					const cells = (row: readonly string[]) => keyed(row, (cell) => cell);
					return (
						<div key={key} className="mc-table">
							<table>
								<thead>
									<tr>
										{cells(head).map((cell) => (
											<th key={cell.key}>{inline(cell.item)}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{keyed(body, (row) => row.join("|")).map((row) => (
										<tr key={row.key}>
											{cells(row.item).map((cell) => (
												<td key={cell.key}>{inline(cell.item)}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				}

				if (block.kind === "list") {
					const items = keyed(block.items, (item) => item).map((item) => (
						<li key={item.key}>{inline(item.item)}</li>
					));
					return block.ordered ? (
						<ol key={key}>{items}</ol>
					) : (
						<ul key={key}>{items}</ul>
					);
				}

				return <p key={key}>{inline(block.text)}</p>;
			})}
		</>
	);
}
