import type { Db, Prisma } from "@crm/db";
import { MEETING_PREP_KIND } from "@crm/db/agent-tasks";
import { readAgentTaskMeetingEventId } from "@crm/validation/agent-task-payload";
import { Injectable } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { NO_DEADLINE } from "../mailbox/mailbox.config";
import { CALENDAR } from "./calendar.config";

export type MeetingPrepSweep = {
	now?: Date;
	deadlineAt?: number;
	signal?: AbortSignal;
};

type SweepLimit = { deadlineAt: number; signal?: AbortSignal };

const UNPREPARED_ATTENDEE = {
	contactId: { not: null },
	contact: { brief: { is: null } },
} satisfies Prisma.CalendarAttendeeWhereInput;

const DECLINED = "declined";

const NOT_DECLINED_BY_US = {
	OR: [
		{ attendees: { none: { isSelf: true, responseStatus: DECLINED } } },
		{
			attendees: {
				some: {
					isSelf: true,
					OR: [{ responseStatus: null }, { responseStatus: { not: DECLINED } }],
				},
			},
		},
	],
} satisfies Prisma.CalendarEventWhereInput;

@Injectable()
export class MeetingPrepService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	forEvent(eventId: string, now: Date = new Date()): Promise<number> {
		return this.queue({ id: eventId }, now, { deadlineAt: NO_DEADLINE });
	}

	sweep(options: MeetingPrepSweep = {}): Promise<number> {
		return this.queue({}, options.now ?? new Date(), {
			deadlineAt: options.deadlineAt ?? NO_DEADLINE,
			signal: options.signal,
		});
	}

	private async queue(
		scope: Prisma.CalendarEventWhereInput,
		now: Date,
		limit: SweepLimit,
	): Promise<number> {
		const until = new Date(now.getTime() + CALENDAR.meetingPrep.soonMs);

		const events = await this.db.calendarEvent.findMany({
			where: {
				AND: [
					scope,
					{
						startsAt: { gt: now, lte: until },
						status: { not: "cancelled" },
						attendees: { some: UNPREPARED_ATTENDEE },
					},
					NOT_DECLINED_BY_US,
				],
			},
			orderBy: { startsAt: "asc" },
			select: {
				id: true,
				startsAt: true,
				attendees: {
					where: UNPREPARED_ATTENDEE,
					select: { contactId: true },
				},
			},
		});

		const contactIds = [
			...new Set(
				events.flatMap((event) =>
					event.attendees.flatMap((attendee) =>
						attendee.contactId ? [attendee.contactId] : [],
					),
				),
			),
		];
		if (contactIds.length === 0) return 0;

		const earlier = await this.db.agentTask.findMany({
			where: {
				kind: MEETING_PREP_KIND,
				contactId: { in: contactIds },
			},
			select: { contactId: true, payload: true },
		});

		const prepared = new Set(
			earlier.map(
				(task) =>
					`${task.contactId}:${readAgentTaskMeetingEventId(task.payload)}`,
			),
		);

		let queued = 0;

		for (const event of events) {
			if (limit.signal?.aborted || Date.now() > limit.deadlineAt) break;

			for (const attendee of event.attendees) {
				if (limit.signal?.aborted || Date.now() > limit.deadlineAt) break;
				if (!attendee.contactId) continue;
				if (prepared.has(`${attendee.contactId}:${event.id}`)) continue;

				const created = await this.agent.meetingSoon(
					attendee.contactId,
					event.startsAt,
					event.id,
				);
				if (created) queued += 1;
			}
		}

		return queued;
	}
}
