import { db } from "@crm/db";
import { MEETING_PREP_KIND } from "@crm/db/agent-tasks";
import { readAgentTaskMeetingEventId } from "@crm/validation/agent-task-payload";
import { COPY } from "./copy";
import { say } from "./language";
import { closeUncounted, type LeasedTask } from "./tasks";

export type MeetingVerdict = "run" | keyof typeof COPY.meetingPrep;

export async function meetingPrecheck(
	task: Pick<LeasedTask, "kind" | "payload">,
	now: Date = new Date(),
): Promise<MeetingVerdict> {
	if (task.kind !== MEETING_PREP_KIND) return "run";

	const eventId = readAgentTaskMeetingEventId(task.payload);
	if (!eventId) return "run";

	const event = await db.calendarEvent.findUnique({
		where: { id: eventId },
		select: {
			status: true,
			startsAt: true,
			attendees: {
				where: { isSelf: true },
				select: { responseStatus: true },
			},
		},
	});

	if (!event) return "gone";
	if (event.status === "cancelled") return "cancelled";
	if (
		event.attendees.length > 0 &&
		event.attendees.every((self) => self.responseStatus === "declined")
	) {
		return "declined";
	}
	if (event.startsAt <= now) return "past";
	return "run";
}

export async function skippedMeetingPrep(task: LeasedTask): Promise<boolean> {
	try {
		const verdict = await meetingPrecheck(task);
		if (verdict === "run") return false;

		await closeUncounted(task, say(COPY.meetingPrep[verdict]));
		return true;
	} catch (error) {
		console.error(
			`[agent] the meeting pre-check failed, so the preparation runs: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return false;
	}
}
