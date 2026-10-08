import type { Db } from "@crm/db";
import {
	CONTACT_CAP_REASONS,
	CONTACTS_PER_HOUR,
	FORM_REFILE,
	REFILABLE_REASONS,
	refileWindowKey,
} from "@crm/db/tracking";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	nameFrom,
	readStoredFields,
	readStoredTouch,
} from "./stored-submission";
import { TrackingCounterService } from "./tracking-counter.service";
import { TrackingFilingService } from "./tracking-filing.service";

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
		const rows = await this.db.formSubmission.findMany({
			where: { filedAt: null, skipReason: { in: [...REFILABLE_REASONS] } },
			orderBy: { createdAt: "asc" },
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

			const outcome = await this.filing.file(
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
			);

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
}
