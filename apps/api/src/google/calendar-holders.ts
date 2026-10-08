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

	await tx.$queryRaw`SELECT "id" FROM "calendarEvent" WHERE "id" = ANY(${eventIds}::text[]) ORDER BY "id" FOR UPDATE`;
	await tx.calendarEventSync.deleteMany({
		where: { userId, eventId: { in: eventIds } },
	});
	const gone = await tx.calendarEvent.deleteMany({
		where: { id: { in: eventIds }, holders: { none: {} } },
	});
	return gone.count;
}
