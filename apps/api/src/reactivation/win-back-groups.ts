import {
	bandRank,
	type ReactivationBand,
	type ReactivationCandidate,
	type ReactivationGroup,
} from "@crm/db/reactivation";

export function personName(contact: ReactivationCandidate["contact"]): string {
	const full = [contact.firstName, contact.lastName]
		.filter((part) => (part ?? "").trim().length > 0)
		.join(" ")
		.trim();

	return full || (contact.email ?? "");
}

export function groupName(group: ReactivationGroup): string {
	const company = group.company?.name.trim();
	if (company) return company;

	const first = group.people[0];

	return first ? personName(first.contact) : "";
}

function matches(group: ReactivationGroup, needle: string): boolean {
	if (groupName(group).toLowerCase().includes(needle)) return true;

	return group.people.some((person) => {
		const contact = person.contact;
		const email = contact.email?.toLowerCase() ?? "";

		return (
			personName(contact).toLowerCase().includes(needle) ||
			email.includes(needle)
		);
	});
}

export function searchGroups(
	groups: readonly ReactivationGroup[],
	term: string,
): ReactivationGroup[] {
	const needle = term.trim().toLowerCase();
	if (needle.length === 0) return [...groups];

	return groups.filter((group) => matches(group, needle));
}

export function countBands(groups: readonly ReactivationGroup[]) {
	const counts = { high: 0, medium: 0, low: 0 };

	for (const group of groups) counts[group.potential] += 1;

	return counts;
}

export function filterBands(
	groups: readonly ReactivationGroup[],
	bands: readonly ReactivationBand[],
): ReactivationGroup[] {
	if (bands.length === 0) return [...groups];

	return groups.filter((group) => bands.includes(group.potential));
}

export function countPeople(groups: readonly ReactivationGroup[]): number {
	return groups.reduce((sum, group) => sum + group.people.length, 0);
}

function compare(
	a: ReactivationGroup,
	b: ReactivationGroup,
	sort: string,
): number {
	if (sort === "name") return groupName(a).localeCompare(groupName(b));
	if (sort === "potential") {
		return bandRank(a.potential) - bandRank(b.potential);
	}
	if (sort === "people") return a.people.length - b.people.length;
	if (sort === "last") {
		return a.lastContactAt.getTime() - b.lastContactAt.getTime();
	}

	return 0;
}

export function sortGroups(
	groups: readonly ReactivationGroup[],
	sort: string,
	dir: "asc" | "desc",
): ReactivationGroup[] {
	if (sort === "") return [...groups];

	const factor = dir === "desc" ? -1 : 1;

	return [...groups].sort((a, b) => {
		const order = compare(a, b, sort) * factor;

		return order || b.points - a.points;
	});
}

export function pageOf(
	groups: readonly ReactivationGroup[],
	page: number,
	pageSize: number,
): ReactivationGroup[] {
	const start = (page - 1) * pageSize;

	return groups.slice(start, start + pageSize);
}
