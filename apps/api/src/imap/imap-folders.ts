import type { ImapFolder } from "./imap.client";
import { IMAP } from "./imap.config";

export function planFolders(folders: ImapFolder[]): ImapFolder[] {
	const selectable = folders.filter(
		(folder) =>
			folder.selectable &&
			!(IMAP.folders.skipSpecialUse as readonly string[]).includes(
				folder.specialUse ?? "",
			),
	);

	const sent = selectable.filter(
		(folder) => folder.specialUse === IMAP.folders.sent,
	);
	const all = selectable.find(
		(folder) => folder.specialUse === IMAP.folders.all,
	);

	if (all) return [...sent, all];

	const inbox = selectable.filter(
		(folder) => folder.path.toUpperCase() === IMAP.folders.inbox,
	);
	const rest = selectable.filter(
		(folder) =>
			!sent.includes(folder) &&
			!inbox.includes(folder) &&
			(folder.specialUse === null ||
				folder.specialUse === IMAP.folders.archive),
	);

	return [...sent, ...inbox, ...rest];
}
