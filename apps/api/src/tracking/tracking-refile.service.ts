import type { Db } from "@crm/db";
import {
	CONTACT_CAP_REASONS,
	CONTACTS_PER_HOUR,
	FORM_REFILE,
	FORMS_PER_VISITOR_HOUR,
	formVisitorWindowKey,
	formWindowStart,
	REFILABLE_REASONS,
	refileWindowKey,
	TRACKING_SKIP,
	WAITING_REASONS,
} from "@crm/db/tracking";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	nameFrom,
	readStoredFields,
	readStoredTouch,
} from "./stored-submission";
import { TrackingCounterService } from "./tracking-counter.service";
import {
	type FilingOutcome,
	TrackingFilingService,
} from "./tracking-filing.service";

const CONTACT_CAPPED = new Set<string>(CONTACT_CAP_REASONS);

export function refilable(submission: {
	filedAt: Date | null;
	skipReason: string | null;
}): boolean {
	if (submission.filedAt !== null) return false;
	if (submission.skipReason === null) return true;

	return (REFILABLE_REASONS as readonly string[]).includes(
		submission.skipReason,
	);
}

@Injectable()
export class TrackingRefileService {
	private readonly logger = new Logger(TrackingRefileService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly counters: TrackingCounterService,
		private readonly filing: TrackingFilingService,
	) {}

	async drainDue(): Promise<number> {
		try {
			if (!(await this.counters.take(refileWindowKey(), 1))) return 0;

			return await this.drain(FORM_REFILE.perPass);
		} catch (error) {
			this.logger.error(
				{ message: "Deferred form submissions could not be filed" },
				error instanceof Error ? error.stack : String(error),
			);

			return 0;
		}
	}

	async drain(limit: number): Promise<number> {
		const waiting = await this.queued([...WAITING_REASONS], limit);
		const failed =
			waiting.length < limit
				? await this.queued(
						[TRACKING_SKIP.refileFailed],
						limit - waiting.length,
					)
				: [];
		const rows = [...waiting, ...failed];

		let filed = 0;

		for (const row of rows) {
			const fields = readStoredFields(row.fields);
			const firstTouch = readStoredTouch(row.firstTouch);
			const lastTouch = readStoredTouch(row.lastTouch);

			if (!fields.ok || !firstTouch.ok || !lastTouch.ok) {
				this.logger.error({
					message: "A deferred form submission has an unreadable stored shape",
					submissionId: row.id,
					fields: fields.ok,
					firstTouch: firstTouch.ok,
					lastTouch: lastTouch.ok,
				});
			}

			const visitorWindow = await this.chargeVisitor(row);

			if (visitorWindow === false) {
				await this.db.formSubmission.updateMany({
					where: { id: row.id, filedAt: null },
					data: { triedAt: new Date() },
				});
				continue;
			}

			const outcome = await this.fileOne(row.id, () =>
				this.filing.file(
					{
						id: row.id,
						email: row.email,
						host: row.host,
						visitorId: row.visitorId,
						name: fields.ok ? nameFrom(fields.value) : null,
						firstTouch: firstTouch.ok ? firstTouch.value : undefined,
						lastTouch: lastTouch.ok ? lastTouch.value : undefined,
					},
					{ contactLimit: CONTACTS_PER_HOUR - FORM_REFILE.liveReserve },
				),
			);

			if (visitorWindow && !outcome?.filed) {
				await this.counters.release(visitorWindow);
			}

			if (!outcome) continue;

			if (outcome.filed) {
				filed += 1;
				continue;
			}

			if (CONTACT_CAPPED.has(outcome.reason)) break;
		}

		if (rows.length > 0) {
			this.logger.log({
				message: "Deferred form submissions refiled",
				read: rows.length,
				filed,
			});
		}

		return filed;
	}

	private async chargeVisitor(row: {
		visitorId: string | null;
	}): Promise<string | null | false> {
		if (!row.visitorId) return null;

		const key = formVisitorWindowKey(row.visitorId);

		return (await this.counters.take(key, FORMS_PER_VISITOR_HOUR))
			? key
			: false;
	}

	private queued(reasons: string[], limit: number) {
		const others = reasons.filter((reason) => reason !== TRACKING_SKIP.formCap);
		const formCapped = reasons.includes(TRACKING_SKIP.formCap)
			? [
					{
						skipReason: TRACKING_SKIP.formCap,
						createdAt: { lt: formWindowStart() },
					},
				]
			: [];

		return this.db.formSubmission.findMany({
			where: {
				filedAt: null,
				OR: [{ skipReason: { in: others } }, ...formCapped],
			},
			orderBy: [
				{ triedAt: { sort: "asc", nulls: "first" } },
				{ createdAt: "asc" },
			],
			take: limit,
			select: {
				id: true,
				email: true,
				host: true,
				visitorId: true,
				fields: true,
				firstTouch: true,
				lastTouch: true,
			},
		});
	}

	private async fileOne(
		submissionId: string,
		file: () => Promise<FilingOutcome>,
	): Promise<FilingOutcome | null> {
		try {
			return await file();
		} catch (error) {
			this.logger.error(
				{
					message: "A deferred form submission could not be filed",
					submissionId,
				},
				error instanceof Error ? error.stack : String(error),
			);

			await this.db.formSubmission.updateMany({
				where: { id: submissionId, filedAt: null },
				data: { skipReason: TRACKING_SKIP.refileFailed, triedAt: new Date() },
			});

			return null;
		}
	}
}
