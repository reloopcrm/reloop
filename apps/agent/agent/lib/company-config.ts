export const COMPANY = {
	descriptionMaxChars: 220,
	descriptionMinChars: 40,
	profileBudget: 1,
} as const;

const SENTENCE_END = /(?<=[.!?])\s+/;

export function shortDescription(value: string | null): string | null {
	const text = value?.trim();
	if (!text) return null;
	if (text.length <= COMPANY.descriptionMaxChars) return text;

	let kept = "";
	for (const sentence of text.split(SENTENCE_END)) {
		const next = kept ? `${kept} ${sentence}` : sentence;
		if (next.length > COMPANY.descriptionMaxChars) break;
		kept = next;
	}

	if (kept.length >= COMPANY.descriptionMinChars) return kept;

	const cut = text.slice(0, COMPANY.descriptionMaxChars);
	const space = cut.lastIndexOf(" ");
	return space > COMPANY.descriptionMinChars ? cut.slice(0, space) : cut;
}
