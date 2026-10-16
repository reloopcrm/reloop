import { ActivityType } from "@crm/db";
import { isWinBackTask } from "@crm/validation/activity-meta";

export type EditableFacts = {
	type: ActivityType;
	meta: unknown;
	emailThreadId: string | null;
	calendarEventId: string | null;
	createdById: string;
};

const EDITABLE_TYPES: ActivityType[] = [ActivityType.NOTE, ActivityType.TASK];

function ownMeta(activity: EditableFacts): boolean {
	return (
		activity.meta === null ||
		(activity.type === ActivityType.TASK && isWinBackTask(activity.meta))
	);
}

export function isEditable(activity: EditableFacts, userId: string): boolean {
	return (
		EDITABLE_TYPES.includes(activity.type) &&
		ownMeta(activity) &&
		activity.emailThreadId === null &&
		activity.calendarEventId === null &&
		activity.createdById === userId
	);
}
