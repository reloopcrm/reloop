import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";
import { ActivityType } from "./generated/prisma/enums";
import { lockIdempotencyKey } from "./idempotency";

export const WIN_BACK_LATER_META = { winBack: true, later: true } as const;

const LATER_MARK = JSON.stringify(WIN_BACK_LATER_META);

export type SnoozeTarget =
	| { contactId: string }
	| { contactId: null; companyId: string };

function openLaterTask(
	contact: Prisma.Sql,
	company: Prisma.Sql,
	now: Date,
): Prisma.Sql {
	return Prisma.sql`sa.type = ${ActivityType.TASK}::"ActivityType"
		AND sa."completedAt" IS NULL
		AND sa."dueAt" > ${now}
		AND sa.meta @> ${LATER_MARK}::jsonb
		AND (
			sa."contactId" = ${contact}
			OR (sa."contactId" IS NULL AND sa."companyId" = ${company})
		)`;
}

export function snoozedAt(
	contact: Prisma.Sql,
	company: Prisma.Sql,
	now: Date,
): Prisma.Sql {
	return Prisma.sql`EXISTS (
		SELECT 1 FROM activity sa
		WHERE ${openLaterTask(contact, company, now)}
	)`;
}

export async function snoozedUntil(
	db: Db,
	contactIds: string[],
	now: Date,
): Promise<Map<string, Date>> {
	if (contactIds.length === 0) return new Map();

	const rows = await db.$queryRaw<{ contactId: string; until: Date }[]>`
		SELECT c.id AS "contactId", MAX(sa."dueAt") AS until
		FROM contact c
		JOIN activity sa ON ${openLaterTask(Prisma.sql`c.id`, Prisma.sql`c."companyId"`, now)}
		WHERE c.id IN (${Prisma.join(contactIds)})
		GROUP BY c.id
	`;

	return new Map(rows.map((row) => [row.contactId, row.until]));
}

export function openSnoozeTask(
	target: SnoozeTarget,
	now: Date,
): Prisma.ActivityWhereInput {
	return {
		type: ActivityType.TASK,
		completedAt: null,
		dueAt: { gt: now },
		meta: { equals: WIN_BACK_LATER_META },
		...(target.contactId === null
			? { contactId: null, companyId: target.companyId }
			: { contactId: target.contactId }),
	};
}

export function snoozeLockKey(target: SnoozeTarget): string {
	return target.contactId === null
		? `win-back-later:company:${target.companyId}`
		: `win-back-later:contact:${target.contactId}`;
}

export async function endSnooze(
	db: Db,
	contactId: string,
	now: Date,
): Promise<number> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { companyId: true },
	});
	if (!contact) return 0;
	const { companyId } = contact;

	return db.$transaction(async (tx) => {
		if (companyId) {
			await lockIdempotencyKey(
				tx,
				snoozeLockKey({ contactId: null, companyId }),
			);
		}
		await lockIdempotencyKey(tx, snoozeLockKey({ contactId }));

		const tasks = await tx.$queryRaw<{ id: string }[]>`
			SELECT sa.id
			FROM contact c
			JOIN activity sa ON ${openLaterTask(Prisma.sql`c.id`, Prisma.sql`c."companyId"`, now)}
			WHERE c.id = ${contactId}
		`;
		if (tasks.length === 0) return 0;

		const ended = await tx.activity.updateMany({
			where: { id: { in: tasks.map((task) => task.id) }, completedAt: null },
			data: { completedAt: now },
		});

		return ended.count;
	});
}
