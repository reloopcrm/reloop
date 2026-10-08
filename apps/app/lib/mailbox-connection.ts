import { db } from "@crm/db";
import { hasOwnRecords } from "@crm/db/sample-data";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { inScope } from "@/cloud/scope.server";
import { demoOffered } from "@/lib/operator";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export const MAILBOX_CONNECTION = {
	calendarSource: "calendar",
} as const;

const hasMailboxConnection = cache(async (): Promise<boolean> => {
	const rows = await inScope(() =>
		db.mailboxSync.count({
			where: { source: { not: MAILBOX_CONNECTION.calendarSource } },
		}),
	);

	return (rows ?? 0) > 0;
});

const hasOwnRecordsHere = cache(
	async (): Promise<boolean> =>
		(await inScope(() => hasOwnRecords(db))) ?? false,
);

export const hasMailboxRecords = cache(async (): Promise<boolean> => {
	if (demoOffered()) return true;
	if (await hasMailboxConnection()) return true;

	return hasSampleData();
});

export const hasRecordsToShow = cache(
	async (): Promise<boolean> =>
		(await hasMailboxRecords()) || (await hasOwnRecordsHere()),
);

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
