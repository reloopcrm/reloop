export function clampAtWord(text: string, max: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;

	const cut = trimmed.slice(0, max - 1);
	const space = cut.search(/\s\S*$/);
	return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
