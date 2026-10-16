import { isWinBackTask } from "@crm/validation/activity-meta";

export type WinBackTaskLink<C> = { path: string; contact: C };

export function winBackTaskLink<C extends { id: string }>(task: {
	meta: unknown;
	contact: C | null;
}): WinBackTaskLink<C> | null {
	if (!task.contact || !isWinBackTask(task.meta)) return null;
	return { path: `/win-back/${task.contact.id}`, contact: task.contact };
}
