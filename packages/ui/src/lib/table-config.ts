export const TABLE = {
	pageSizes: [25, 50, 100],
	defaultPageSize: 25,
	column: {
		selectPx: 36,
		controlPx: 68,
		defaultPx: 140,
		minPx: 72,
		primaryMinPx: 180,
	},
	pager: { siblings: 1 },
	selectionBar: { clearancePx: 32 },
} as const;

export type PageSize = (typeof TABLE.pageSizes)[number];

export function isPageSize(value: number): value is PageSize {
	return (TABLE.pageSizes as readonly number[]).includes(value);
}

export function fitColumnWidths(
	available: number,
	sizes: readonly number[],
): number[] {
	const total = sizes.reduce((sum, size) => sum + size, 0);
	const room = Math.max(available - TABLE.column.primaryMinPx, 0);
	if (total <= room) return [...sizes];

	const scale = total > 0 ? room / total : 1;
	const floored = sizes.map((size) =>
		Math.max(TABLE.column.minPx, Math.round(size * scale)),
	);
	const flooredTotal = floored.reduce((sum, size) => sum + size, 0);
	if (flooredTotal <= room) return floored;

	return sizes.map((size) => Math.floor(size * scale));
}

export function pageWindow(page: number, totalPages: number): number[] {
	const { siblings } = TABLE.pager;
	const pages = new Set<number>([1, totalPages]);
	for (let n = page - siblings; n <= page + siblings; n++) {
		if (n >= 1 && n <= totalPages) pages.add(n);
	}
	return [...pages].sort((a, b) => a - b);
}
