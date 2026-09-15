import { describe, expect, it } from "bun:test";
import type { ImapFolder } from "../src/imap/imap.client";
import { planFolders } from "../src/imap/imap-folders";

const folder = (
	path: string,
	specialUse: string | null = null,
	selectable = true,
): ImapFolder => ({ path, specialUse, selectable });

describe("planFolders", () => {
	it("reads Sent first, then All Mail, on a Gmail layout", () => {
		const plan = planFolders([
			folder("INBOX"),
			folder("[Gmail]", null, false),
			folder("[Gmail]/All Mail", "\\All"),
			folder("[Gmail]/Sent Mail", "\\Sent"),
			folder("[Gmail]/Spam", "\\Junk"),
			folder("[Gmail]/Trash", "\\Trash"),
			folder("[Gmail]/Drafts", "\\Drafts"),
			folder("[Gmail]/Starred", "\\Flagged"),
			folder("[Gmail]/Important", "\\Important"),
		]);

		expect(plan.map((entry) => entry.path)).toEqual([
			"[Gmail]/Sent Mail",
			"[Gmail]/All Mail",
		]);
	});

	it("reads Sent, INBOX, then the rest on a plain layout", () => {
		const plan = planFolders([
			folder("INBOX"),
			folder("Projects"),
			folder("Sent", "\\Sent"),
			folder("Archive", "\\Archive"),
			folder("Junk", "\\Junk"),
			folder("Trash", "\\Trash"),
			folder("Drafts", "\\Drafts"),
			folder("Shared", null, false),
		]);

		expect(plan.map((entry) => entry.path)).toEqual([
			"Sent",
			"INBOX",
			"Projects",
			"Archive",
		]);
	});
});
