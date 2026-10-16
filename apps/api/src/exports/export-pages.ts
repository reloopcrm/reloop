export async function* pagesByIds<TRow extends { id: string }>(
	ids: string[],
	pageSize: number,
	load: (chunk: string[]) => Promise<TRow[]>,
): AsyncGenerator<TRow[]> {
	for (let start = 0; start < ids.length; start += pageSize) {
		const chunk = ids.slice(start, start + pageSize);
		const loaded = new Map((await load(chunk)).map((row) => [row.id, row]));
		const rows = chunk.flatMap((id) => {
			const row = loaded.get(id);
			return row ? [row] : [];
		});
		if (rows.length > 0) yield rows;
	}
}
