export const SAMPLE_DATA = {
	prefix: "demo-",
} as const;

export const SAMPLE_ID_PATTERN = `${SAMPLE_DATA.prefix}%`;

export function isSampleRecordId(id: string | null | undefined): boolean {
	return id?.startsWith(SAMPLE_DATA.prefix) ?? false;
}

export const NOT_SAMPLE_RECORD = {
	id: { not: { startsWith: SAMPLE_DATA.prefix } },
} as const;
