import { db } from "@crm/db";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { demoOffered } from "@/lib/operator";
import { inTenant } from "@/lib/tenant";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const MAILBOX_CONNECTION = {
	calendarSource: "calendar",
} as const;

const hasMailboxConnection = cache(async (): Promise<boolean> => {
	const rows = await inTenant(() =>
		db.mailboxSync.count({
			where: { source: { not: MAILBOX_CONNECTION.calendarSource } },
		}),
	);

	return (rows ?? 0) > 0;
});

export const hasRecordsToShow = cache(async (): Promise<boolean> => {
	if (demoOffered()) return true;
	if (await hasMailboxConnection()) return true;

	return hasSampleData();
});

async function hasSampleData(): Promise<boolean> {
	try {
		const status = await getServerQueryClient().fetchQuery(
			getServerTrpc().sampleData.status.queryOptions(),
		);

		return status.present;
	} catch (error) {
		unstable_rethrow(error);
		return false;
	}
}
