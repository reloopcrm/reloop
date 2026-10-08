import { SEARCH } from "@crm/validation/search";

export type QuickSearchEmpty = "short" | "searching" | "none";

export function quickSearchEmpty(
	query: string,
	fetching: boolean,
): QuickSearchEmpty {
	if (query.trim().length < SEARCH.minLength) return "short";
	return fetching ? "searching" : "none";
}
