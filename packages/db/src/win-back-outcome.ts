import type { Db } from "./client";
import { Prisma } from "./generated/prisma/client";
import { realAnswer } from "./real-answer";

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

export type WinBackReply = {
	answeredAt: Date;
	open: boolean;
};

type LoopScope = { ownerId?: string | null; contactId?: string };

function loop(scope: LoopScope = {}): Prisma.Sql {
	const owner = scope.ownerId
		? Prisma.sql`AND c."ownerId" = ${scope.ownerId}`
		: Prisma.empty;
	const contact = scope.contactId
		? Prisma.sql`AND c.id = ${scope.contactId}`
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
				${contact}
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
			SELECT o.contact_id, MAX(m."sentAt") AS answered_at
			FROM outreach o
			JOIN "emailThread" t ON t."contactId" = o.contact_id
			JOIN "emailMessage" m ON m."threadId" = t.id
			WHERE m."sentAt" > o.contacted_at AND ${realAnswer("m")}
			GROUP BY o.contact_id
		)
	`;
}

export function wroteBackAfterOutreach(contactColumn: Prisma.Sql): Prisma.Sql {
	return Prisma.sql`${contactColumn} IN (
		WITH ${loop()}
		SELECT contact_id FROM answered
	)`;
}

export async function readWinBackReply(
	db: Db,
	contactId: string,
): Promise<WinBackReply | null> {
	const rows = await db.$queryRaw<{ answeredAt: Date; open: boolean }[]>`
		WITH ${loop({ contactId })},
		own AS (
			SELECT t.id
			FROM "emailThread" t
			WHERE t."contactId" = ${contactId}
				OR EXISTS (
					SELECT 1 FROM "emailThreadContact" l
					WHERE l."threadId" = t.id AND l."contactId" = ${contactId}
				)
		),
		reply AS (
			SELECT
				c.email,
				COALESCE(
					(
						SELECT MAX(m."sentAt")
						FROM own
						JOIN "emailMessage" m ON m."threadId" = own.id
						WHERE m."sentAt" > o.contacted_at
							AND c.email IS NOT NULL
							AND lower(m."fromEmail") = lower(trim(c.email))
							AND ${realAnswer("m")}
					),
					a.answered_at
				) AS answered_at
			FROM answered a
			JOIN outreach o ON o.contact_id = a.contact_id
			JOIN contact c ON c.id = a.contact_id
		)
		SELECT
			r.answered_at AS "answeredAt",
			NOT EXISTS (
				SELECT 1
				FROM own
				JOIN "emailMessage" m ON m."threadId" = own.id
				WHERE m.direction = 'OUTBOUND'
					AND m."sentAt" > r.answered_at
					AND (
						r.email IS NULL
						OR m.recipients @> jsonb_build_array(
							jsonb_build_object('email', lower(trim(r.email)))
						)
					)
			) AS open
		FROM reply r
	`;
	const row = rows[0];

	return row ? { answeredAt: row.answeredAt, open: row.open } : null;
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
		WITH ${loop({ ownerId: options.ownerId })},
		reached AS (
			SELECT * FROM outreach WHERE contacted_at >= ${options.since}
		),
		won AS (
			SELECT DISTINCT d.id, d.amount, d."baseAmount", d."baseCurrency"
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
				WHERE amount IS NOT NULL
					AND "baseCurrency" IS DISTINCT FROM ${options.baseCurrency}
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
		WITH ${loop()}
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
