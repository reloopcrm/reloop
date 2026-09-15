import { z } from "zod";

export const imapFolderCursor = z.object({
	uidValidity: z.string(),
	lastUid: z.number().int().min(0),
	backfillUid: z.number().int().min(1).nullable(),
	floorUid: z.number().int().min(1),
});

export const imapCursor = z.object({
	v: z.literal(1),
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

export function backlogOf(cursor: ImapCursor): number {
	let remaining = 0;

	for (const folder of Object.values(cursor.folders)) {
		if (folder.backfillUid === null) continue;
		remaining += Math.max(0, folder.backfillUid - folder.floorUid + 1);
	}

	return remaining;
}
