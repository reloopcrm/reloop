import { WIN_BACK_SELECTION } from "@crm/validation/win-back-selection";
import type { Translate } from "@/lib/i18n/locale";

type AiSelectionPerson = {
	id: string;
	name: string;
	title: string | null;
};

export type AiSelectionGroup = {
	company: string | null;
	people: AiSelectionPerson[];
};

function chunksOf<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		chunks.push(items.slice(start, start + size));
	}
	return chunks;
}

function personLine(group: AiSelectionGroup, person: AiSelectionPerson) {
	const who = person.title ? `${person.name}, ${person.title}` : person.name;
	return group.company ? `- ${group.company}: ${who}` : `- ${who}`;
}

export function winBackAiPrompt(
	groups: AiSelectionGroup[],
	t: Translate,
): string {
	const ids = [
		...new Set(groups.flatMap((group) => group.people.map((one) => one.id))),
	];
	const batches = chunksOf(ids, WIN_BACK_SELECTION.maxContacts);
	const tool = WIN_BACK_SELECTION.tool;

	return [
		ids.length === 1
			? t(
					"This is a selection from Reloop, my CRM: 1 contact I want to win back.",
				)
			: t(
					"This is a selection from Reloop, my CRM: {count} contacts I want to win back.",
					{ count: ids.length },
				),
		batches.length === 1
			? t(
					"Get their data through the Reloop connection (MCP). Call the tool {tool} with these contactIds:",
					{ tool },
				)
			: t(
					"Get their data through the Reloop connection (MCP). Call the tool {tool} once for each of these lists of contactIds:",
					{ tool },
				),
		...batches.map((batch) => JSON.stringify(batch)),
		t(
			"For each contact it returns the company, why they are worth winning back, the latest mails and the draft Reloop wrote. Then help me win each one back: tell me whom to write to first and what each mail should say.",
		),
		t("If {tool} is not there, call {fallback} for each contactId.", {
			tool,
			fallback: WIN_BACK_SELECTION.fallbackTools.join(", "),
		}),
		"",
		t("The selection:"),
		...groups.flatMap((group) =>
			group.people.map((person) => personLine(group, person)),
		),
		"",
		t(
			"No Reloop connection in this chat? Set it up in Reloop under {path}. Then send me this text again.",
			{
				path: [t("Settings"), t("Connections"), t("AI assistants")].join(", "),
			},
		),
	].join("\n");
}
