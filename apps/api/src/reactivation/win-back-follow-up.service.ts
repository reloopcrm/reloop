import { ActivityType, type Db } from "@crm/db";
import {
	DAY_MS,
	listWinBackFollowUps,
	startOfUtcDay,
	type WinBackFollowUp,
} from "@crm/db/win-back-outcome";
import {
	isAgentFunctionEnabled,
	readAgentFunctions,
	WIN_BACK_FOLLOW_UP_FUNCTION,
} from "@crm/validation/agent-functions";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { WIN_BACK } from "./reactivation.config";

export const WIN_BACK_FOLLOW_UP_SUBJECT = "Follow up on the win back";

export const WIN_BACK_FOLLOW_UP_BODY =
	"You wrote to them after the win back verdict and nobody answered.";

export type FollowUpSweep = { created: number; capped: boolean; off: boolean };

@Injectable()
export class WinBackFollowUpService {
	private readonly logger = new Logger(WinBackFollowUpService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async sweep(now = new Date()): Promise<FollowUpSweep> {
		const functions = await readAgentFunctions(this.db);

		if (!isAgentFunctionEnabled(functions, WIN_BACK_FOLLOW_UP_FUNCTION)) {
			return { created: 0, capped: false, off: true };
		}

		const madeToday = await this.db.potentialFeedback.count({
			where: { followUpTaskAt: { gte: startOfUtcDay(now) } },
		});
		const room = WIN_BACK.followUp.maxPerDay - madeToday;

		if (room <= 0) return { created: 0, capped: true, off: false };

		const candidates = await listWinBackFollowUps(this.db, {
			now,
			afterDays: WIN_BACK.followUp.afterDays,
			maxAgeDays: WIN_BACK.followUp.maxAgeDays,
			limit: room,
		});
		const authors = await this.authors(candidates);

		let created = 0;

		for (const candidate of candidates) {
			const author = authorOf(candidate, authors);

			if (!author) {
				this.logger.log({
					message: "No owner to give the win back follow-up to",
					contactId: candidate.contactId,
				});
				continue;
			}

			if (await this.write(candidate, author, now)) created += 1;
		}

		if (created > 0) {
			this.logger.log({ message: "Win back follow-ups written", created });
		}

		return {
			created,
			capped: created >= room && candidates.length >= room,
			off: false,
		};
	}

	private async authors(
		candidates: readonly WinBackFollowUp[],
	): Promise<Set<string>> {
		const ids = candidates.flatMap((candidate) =>
			[candidate.decidedBy, candidate.ownerId].filter(
				(id): id is string => id !== null,
			),
		);
		if (ids.length === 0) return new Set();

		const users = await this.db.user.findMany({
			where: { id: { in: [...new Set(ids)] } },
			select: { id: true },
		});

		return new Set(users.map((user) => user.id));
	}

	private async write(
		candidate: WinBackFollowUp,
		createdById: string,
		now: Date,
	): Promise<boolean> {
		const dueAt = startOfUtcDay(
			new Date(
				candidate.contactedAt.getTime() + WIN_BACK.followUp.afterDays * DAY_MS,
			),
		);

		const written = await this.db.$transaction(async (tx) => {
			const claimed = await tx.potentialFeedback.updateMany({
				where: { contactId: candidate.contactId, followUpTaskAt: null },
				data: { followUpTaskAt: now },
			});
			if (claimed.count === 0) return false;

			await tx.activity.create({
				data: {
					type: ActivityType.TASK,
					subject: WIN_BACK_FOLLOW_UP_SUBJECT,
					body: WIN_BACK_FOLLOW_UP_BODY,
					occurredAt: now,
					dueAt,
					contactId: candidate.contactId,
					companyId: candidate.companyId,
					createdById,
					meta: { winBack: true },
				},
				select: { id: true },
			});

			return true;
		});

		if (!written) return false;

		try {
			await this.stamp.touch(
				{ companyId: candidate.companyId, contactId: candidate.contactId },
				now,
			);
		} catch (error) {
			this.logger.error(
				{
					message:
						"A win back follow-up was written but its stamps did not move",
					contactId: candidate.contactId,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}

		return true;
	}
}

function authorOf(
	candidate: WinBackFollowUp,
	known: ReadonlySet<string>,
): string | null {
	if (candidate.decidedBy && known.has(candidate.decidedBy)) {
		return candidate.decidedBy;
	}
	if (candidate.ownerId && known.has(candidate.ownerId)) {
		return candidate.ownerId;
	}

	return null;
}
