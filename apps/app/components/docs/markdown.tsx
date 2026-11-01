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

const ALERT = /^\[!([a-z]+)\]$/i;

const LIST_ITEM = /^\s*(?:([-*])|\d+\.)\s+(.*)$/;

const CONTINUATION = /^\s+\S/;

const BLOCK_START = /^(#{1,6}\s|```|\||>|\s*(?:[-*]|\d+\.)\s)/;

const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;

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
