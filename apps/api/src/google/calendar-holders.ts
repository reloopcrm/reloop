import type { Prisma } from "@crm/db";

export function heldByUser(userId: string): Prisma.CalendarEventWhereInput {
	return {
		OR: [
			{ holders: { some: { userId } } },
			{ holders: { none: {} }, syncedByUserId: userId },
		],
	};
}
