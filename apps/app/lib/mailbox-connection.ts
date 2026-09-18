import { db } from "@crm/db";
import { cache } from "react";
import { demoOffered } from "@/lib/operator";

export const MAILBOX_CONNECTION = {
	calendarSource: "calendar",
} as const;

export const hasMailboxConnection = cache(async (): Promise<boolean> => {
	if (demoOffered()) return true;

	const rows = await db.mailboxSync.count({
		where: { source: { not: MAILBOX_CONNECTION.calendarSource } },
	});

	return rows > 0;
});
