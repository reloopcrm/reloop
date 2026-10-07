import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";
import { ActivityType } from "./generated/prisma/enums";

export const WIN_BACK_LATER_META = { winBack: true, later: true } as const;

const LATER_MARK = JSON.stringify(WIN_BACK_LATER_META);

export function snoozedAt(
	contact: Prisma.Sql,
	company: Prisma.Sql,
	now: Date,
): Prisma.Sql {
	return Prisma.sql`EXISTS (
		SELECT 1 FROM activity sa
		WHERE sa.type = ${ActivityType.TASK}::"ActivityType"
			AND sa."completedAt" IS NULL
			AND sa."dueAt" > ${now}
			AND sa.meta @> ${LATER_MARK}::jsonb
			AND (
				sa."contactId" = ${contact}
				OR (sa."contactId" IS NULL AND sa."companyId" = ${company})
			)
	)`;
}

export async function isSnoozed(
	db: Db,
	contactId: string,
	now: Date,
): Promise<boolean> {
	const rows = await db.$queryRaw<{ snoozed: boolean }[]>`
		SELECT ${snoozedAt(Prisma.sql`c.id`, Prisma.sql`c."companyId"`, now)} AS snoozed
		FROM contact c
		WHERE c.id = ${contactId}
	`;

	return rows[0]?.snoozed === true;
}
