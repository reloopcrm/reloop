import { z } from "zod";
import { messageFailures } from "../mailbox/message-failures";

export const imapFolderCursor = z.object({
	uidValidity: z.string(),
	lastUid: z.number().int().min(0),
	backfillUid: z.number().int().min(1).nullable(),
	floorUid: z.number().int().min(1),
	failures: messageFailures.optional(),
});

export const imapCursor = z.object({
	v: z.literal(1),
	rewinds: z.number().int().min(0).optional(),
	folders: z.record(z.string(), imapFolderCursor),
});

export type ImapFolderCursor = z.infer<typeof imapFolderCursor>;
export type ImapCursor = z.infer<typeof imapCursor>;

export function emptyImapCursor(): ImapCursor {
	return { v: 1, folders: {} };
}

export function parseImapCursor(raw: string | null | undefined): ImapCursor {
	if (!raw) return emptyImapCursor();

	try {
		const parsed = imapCursor.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : emptyImapCursor();
	} catch {
		return emptyImapCursor();
	}
}

export function serialiseImapCursor(cursor: ImapCursor): string {
	return JSON.stringify(cursor);
}

export function rewindBackfill(cursor: ImapCursor): ImapCursor {
	const folders: ImapCursor["folders"] = {};

	for (const [path, folder] of Object.entries(cursor.folders)) {
		folders[path] = {
			...folder,
			backfillUid: folder.lastUid >= folder.floorUid ? folder.lastUid : null,
		};
	}

	return { ...cursor, folders };
}

export function rewindsOf(cursor: ImapCursor): number {
	return cursor.rewinds ?? 0;
}

export function requestRewind(cursor: ImapCursor): ImapCursor {
	return { ...rewindBackfill(cursor), rewinds: rewindsOf(cursor) + 1 };
}

export function backlogOf(cursor: ImapCursor): number {
	let remaining = 0;

	for (const folder of Object.values(cursor.folders)) {
		if (folder.backfillUid === null) continue;
		remaining += Math.max(0, folder.backfillUid - folder.floorUid + 1);
	}

	return remaining;
}
