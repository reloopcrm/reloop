import type { Db } from "./client";

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

export type OwnRecordsDb = Pick<Db, "company" | "contact" | "deal">;

export async function hasOwnRecords(db: OwnRecordsDb): Promise<boolean> {
	const found = { where: NOT_SAMPLE_RECORD, select: { id: true } } as const;
	const rows = await Promise.all([
		db.company.findFirst(found),
		db.contact.findFirst(found),
		db.deal.findFirst(found),
	]);

	return rows.some((row) => row !== null);
}
