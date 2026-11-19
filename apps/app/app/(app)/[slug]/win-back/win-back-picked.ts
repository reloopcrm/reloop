import { contactName } from "@/components/crm/contact-name";
import type { Translate } from "@/lib/i18n/locale";
import type { AiSelectionGroup } from "./win-back-ai-prompt";

type PickablePerson = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
};

type PickableRow = {
	key: string;
	company: { name: string } | null;
	people: PickablePerson[];
};

export type WinBackPicked = {
	groups: AiSelectionGroup[];
	contactIds: string[];
	companies: number;
};

export function pickableIds(rows: PickableRow[]): string[] {
	return rows.flatMap((row) =>
		row.people.length > 0 ? row.people.map((person) => person.id) : [row.key],
	);
}

export function winBackPicked(
	rows: PickableRow[],
	has: (id: string) => boolean,
): WinBackPicked {
	const groups = rows
		.map((row) => ({
			company: row.company?.name ?? null,
			people: row.people
				.filter((person) => has(person.id))
				.map((person) => ({
					id: person.id,
					name: contactName(person) || (person.email ?? ""),
					title: person.title,
				})),
		}))
		.filter((group) => group.people.length > 0);

	return {
		groups,
		contactIds: groups.flatMap((group) =>
			group.people.map((person) => person.id),
		),
		companies: groups.filter((group) => group.company !== null).length,
	};
}

export function pickedSummary(picked: WinBackPicked, t: Translate): string {
	const count = picked.contactIds.length;
	const people = count === 1 ? t("1 person") : t("{count} people", { count });
	if (picked.companies === 0) return people;

	const companies =
		picked.companies === 1
			? t("1 company")
			: t("{count} companies", { count: picked.companies });

	return t("{people} from {companies}", { people, companies });
}
