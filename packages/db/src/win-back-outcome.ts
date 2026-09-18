import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";

export type WinBackOutcome = {
	verdicts: number;
	contacted: number;
	answered: number;
	deals: number;
	dealAmount: Prisma.Decimal | null;
	unconvertedDeals: number;
};

export type WinBackFollowUp = {
	contactId: string;
	contactedAt: Date;
	decidedBy: string | null;
	ownerId: string | null;
	firstName: string;
	lastName: string | null;
	companyId: string | null;
};

export const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function loop(ownerId: string | null | undefined): Prisma.Sql {
	const owner = ownerId
		? Prisma.sql`AND c."ownerId" = ${ownerId}`
		: Prisma.empty;

	return Prisma.sql`
		verdict AS (
			SELECT
				fb."contactId" AS contact_id,
				fb."updatedAt" AS decided_at,
				fb."followUpTaskAt" AS follow_up_at,
				fb."userId" AS decided_by
			FROM "potentialFeedback" fb
			JOIN contact c ON c.id = fb."contactId"
			WHERE fb.verdict <> 'bad'
				AND c."archivedAt" IS NULL
				${owner}
		),
		outreach AS (
			SELECT
				v.contact_id,
				v.follow_up_at,
				v.decided_by,
				MIN(m."sentAt") FILTER (WHERE m.direction = 'OUTBOUND') AS contacted_at
			FROM verdict v
			JOIN "emailThread" t ON t."contactId" = v.contact_id
			JOIN "emailMessage" m ON m."threadId" = t.id AND m."sentAt" > v.decided_at
			GROUP BY v.contact_id, v.follow_up_at, v.decided_by
			HAVING MIN(m."sentAt") FILTER (WHERE m.direction = 'OUTBOUND') IS NOT NULL
		),
		answered AS (
			SELECT o.contact_id
			FROM outreach o
			JOIN "emailThread" t ON t."contactId" = o.contact_id
			JOIN "emailMessage" m ON m."threadId" = t.id
			WHERE m.direction = 'INBOUND' AND m."sentAt" > o.contacted_at
			GROUP BY o.contact_id
		)
	`;
}

export async function readWinBackOutcome(
	db: Db,
	options: { since: Date; baseCurrency: string; ownerId?: string | null },
): Promise<WinBackOutcome> {
	const rows = await db.$queryRaw<
		{
			verdicts: bigint;
			contacted: bigint;
			answered: bigint;
			deals: bigint;
			dealAmount: Prisma.Decimal | null;
			unconverted: bigint;
		}[]
	>`
		WITH ${loop(options.ownerId)},
		reached AS (
			SELECT * FROM outreach WHERE contacted_at >= ${options.since}
		),
		won AS (
			SELECT DISTINCT d.id, d."baseAmount", d."baseCurrency"
			FROM reached r
			JOIN "dealContact" dc ON dc."contactId" = r.contact_id
			JOIN deal d ON d.id = dc."dealId"
			WHERE d."archivedAt" IS NULL AND d."createdAt" >= r.contacted_at
		)
		SELECT
			(SELECT COUNT(*) FROM verdict) AS verdicts,
			(SELECT COUNT(*) FROM reached) AS contacted,
			(
				SELECT COUNT(*) FROM reached r
				JOIN answered a ON a.contact_id = r.contact_id
			) AS answered,
			(SELECT COUNT(*) FROM won) AS deals,
			(
				SELECT SUM("baseAmount") FROM won
				WHERE "baseCurrency" = ${options.baseCurrency}
			) AS "dealAmount",
			(
				SELECT COUNT(*) FROM won
				WHERE "baseCurrency" IS DISTINCT FROM ${options.baseCurrency}
			) AS unconverted
	`;

	const row = rows[0];

	return {
		verdicts: Number(row?.verdicts ?? 0),
		contacted: Number(row?.contacted ?? 0),
		answered: Number(row?.answered ?? 0),
		deals: Number(row?.deals ?? 0),
		dealAmount: row?.dealAmount ?? null,
		unconvertedDeals: Number(row?.unconverted ?? 0),
	};
}

export async function listWinBackFollowUps(
	db: Db,
	options: { now: Date; afterDays: number; maxAgeDays: number; limit: number },
): Promise<WinBackFollowUp[]> {
	if (options.limit <= 0) return [];

	const due = new Date(options.now.getTime() - options.afterDays * DAY_MS);
	const floor = new Date(options.now.getTime() - options.maxAgeDays * DAY_MS);

	const rows = await db.$queryRaw<
		{
			contactId: string;
			contactedAt: Date;
			decidedBy: string | null;
			ownerId: string | null;
			firstName: string;
			lastName: string | null;
			companyId: string | null;
		}[]
	>`
		WITH ${loop(null)}
		SELECT
			o.contact_id AS "contactId",
			o.contacted_at AS "contactedAt",
			o.decided_by AS "decidedBy",
			c."ownerId" AS "ownerId",
			c."firstName" AS "firstName",
			c."lastName" AS "lastName",
			c."companyId" AS "companyId"
		FROM outreach o
		JOIN contact c ON c.id = o.contact_id
		LEFT JOIN answered a ON a.contact_id = o.contact_id
		WHERE o.follow_up_at IS NULL
			AND a.contact_id IS NULL
			AND o.contacted_at <= ${due}
			AND o.contacted_at >= ${floor}
		ORDER BY o.contacted_at ASC
		LIMIT ${options.limit}
	`;

	return rows;
}
