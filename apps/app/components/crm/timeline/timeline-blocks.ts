import { cleanSubject } from "@crm/ui/lib/email-text";

type Groupable = {
	id: string;
	subject: string | null;
	emailThread: { id: string } | null;
};

export type TimelineBlock<E extends Groupable> =
	| { kind: "thread"; key: string; entries: E[] }
	| { kind: "entry"; key: string; entry: E };

function threadKeys(entry: Groupable): string[] {
	if (!entry.emailThread) return [];
	const keys = [`id:${entry.emailThread.id}`];
	if (entry.subject) keys.push(`subject:${cleanSubject(entry.subject)}`);
	return keys;
}

export function toBlocks<E extends Groupable>(
	entries: E[],
): TimelineBlock<E>[] {
	const blocks: TimelineBlock<E>[] = [];
	let open: {
		block: { kind: "thread"; key: string; entries: E[] };
		keys: string[];
	} | null = null;

	for (const entry of entries) {
		const keys = threadKeys(entry);
		if (keys.length === 0) {
			open = null;
			blocks.push({ kind: "entry", key: entry.id, entry });
			continue;
		}
		if (open && keys.some((key) => open?.keys.includes(key))) {
			open.block.entries.push(entry);
			open.keys.push(...keys);
			continue;
		}
		const block = {
			kind: "thread" as const,
			key: keys[0] ?? "",
			entries: [entry],
		};
		blocks.push(block);
		open = { block, keys: [...keys] };
	}

	return blocks;
}
