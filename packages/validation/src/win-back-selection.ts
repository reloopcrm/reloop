import { z } from "zod";

export const WIN_BACK_SELECTION = {
	tool: "get_win_back_selection",
	fallbackTools: ["get_contact", "get_contact_mails", "get_contact_draft"],
	maxContacts: 20,
	idMaxChars: 200,
} as const;

export const winBackSelectionContactIds = z
	.array(z.string().trim().min(1).max(WIN_BACK_SELECTION.idMaxChars))
	.min(1)
	.max(WIN_BACK_SELECTION.maxContacts);
