import { ActivityType } from "@crm/db";
import { z } from "zod";

export type EditableFacts = {
	type: ActivityType;
	meta: unknown;
	emailThreadId: string | null;
	calendarEventId: string | null;
	createdById: string;
};

const EDITABLE_TYPES: ActivityType[] = [ActivityType.NOTE, ActivityType.TASK];

const winBackTaskMeta = z.object({ winBack: z.literal(true) }).strict();

function ownMeta(activity: EditableFacts): boolean {
	return (
		activity.meta === null ||
		(activity.type === ActivityType.TASK &&
			winBackTaskMeta.safeParse(activity.meta).success)
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
