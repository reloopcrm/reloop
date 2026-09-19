import { ActivityType } from "@crm/db";

export type EditableFacts = {
	type: ActivityType;
	meta: unknown;
	emailThreadId: string | null;
	calendarEventId: string | null;
	createdById: string;
};

const EDITABLE_TYPES: ActivityType[] = [ActivityType.NOTE, ActivityType.TASK];

export function isEditable(activity: EditableFacts, userId: string): boolean {
	return (
		EDITABLE_TYPES.includes(activity.type) &&
		activity.meta === null &&
		activity.emailThreadId === null &&
		activity.calendarEventId === null &&
		activity.createdById === userId
	);
}
