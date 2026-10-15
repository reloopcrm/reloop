import type { Prisma } from "@crm/db";

export function heldByUser(userId: string): Prisma.CalendarEventWhereInput {
	return {
		OR: [
			{ holders: { some: { userId } } },
			{ holders: { none: {} }, syncedByUserId: userId },
		],
	};
}

export async function releaseEvents(
	tx: Prisma.TransactionClient,
	userId: string,
	eventIds: string[],
): Promise<number> {
	if (eventIds.length === 0) return 0;

	await lockEvents(tx, eventIds);
	await tx.calendarEventSync.deleteMany({
		where: { userId, eventId: { in: eventIds } },
	});
	const gone = await tx.calendarEvent.deleteMany({
		where: { id: { in: eventIds }, holders: { none: {} } },
	});
	return gone.count;
}

export async function lockEvents(
	tx: Prisma.TransactionClient,
	eventIds: string[],
): Promise<string[]> {
	const rows = await tx.$queryRaw<
		{ id: string }[]
	>`SELECT "id" FROM "calendarEvent" WHERE "id" = ANY(${eventIds}::text[]) ORDER BY "id" FOR UPDATE`;
	return rows.map((row) => row.id);
}

export async function holdSyncRow(
	tx: Prisma.TransactionClient,
	syncId: string,
): Promise<boolean> {
	const rows = await tx.$queryRaw<
		{ id: string }[]
	>`SELECT "id" FROM "mailboxSync" WHERE "id" = ${syncId} FOR KEY SHARE`;
	return rows.length > 0;
}
