import { cleanSubject } from "@crm/ui/lib/email-text";

type Groupable = {
	id: string;
	subject: string | null;
	occurredAt: string | null;
	createdAt: string;
	emailThread: { id: string; lastMessage: object | null } | null;
};

type BlockWhen = { key: string; occurredAt: string | null; createdAt: string };

export type ThreadBlock<E extends Groupable> = BlockWhen & {
	kind: "thread";
	entries: E[];
};

export type TimelineBlock<E extends Groupable> =
	| ThreadBlock<E>
	| (BlockWhen & { kind: "entry"; entry: E });

function threadKeys(entry: Groupable): string[] {
	if (!entry.emailThread?.lastMessage) return [];
	const keys = [`id:${entry.emailThread.id}`];
	if (entry.subject) keys.push(`subject:${cleanSubject(entry.subject)}`);
	return keys;
}

export function toBlocks<E extends Groupable>(
	entries: E[],
): TimelineBlock<E>[] {
	const blocks: TimelineBlock<E>[] = [];
	let open: { block: ThreadBlock<E>; keys: string[] } | null = null;

	for (const entry of entries) {
		const keys = threadKeys(entry);
		const when = {
			occurredAt: entry.occurredAt,
			createdAt: entry.createdAt,
		};

		if (keys.length === 0) {
			open = null;
			blocks.push({ kind: "entry", key: entry.id, entry, ...when });
			continue;
		}

		if (open && keys.some((key) => open?.keys.includes(key))) {
			open.block.entries.push(entry);
			open.keys.push(...keys);
			continue;
		}

		const block: ThreadBlock<E> = {
			kind: "thread",
			key: keys[0] ?? entry.id,
			entries: [entry],
			...when,
		};
		blocks.push(block);
		open = { block, keys: [...keys] };
	}

	return blocks;
}
