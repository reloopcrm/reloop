import { z } from "zod";

export const SEARCH = {
	minLength: 2,
	maxLength: 80,
	maxWords: 5,
	perKind: 5,
} as const;

export const quickSearchTerm = z
	.string()
	.trim()
	.max(SEARCH.maxLength)
	.default("")
	.transform((value) =>
		value.split(/\s+/).filter(Boolean).slice(0, SEARCH.maxWords).join(" "),
	);
