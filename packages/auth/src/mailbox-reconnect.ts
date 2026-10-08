import { db, GoogleSyncStatus } from "@crm/db";
import { isMailboxProvider, SYNC_SOURCES_FOR } from "./scopes";

export type StoredMailboxGrant = {
	userId: string;
	providerId: string;
	refreshToken?: string | null;
};

export async function clearMailboxReconnect(
	account: StoredMailboxGrant,
): Promise<number> {
	if (!isMailboxProvider(account.providerId) || !account.refreshToken) {
		return 0;
	}

	try {
		const cleared = await db.mailboxSync.updateMany({
			where: {
				userId: account.userId,
				source: { in: [...SYNC_SOURCES_FOR[account.providerId]] },
				status: GoogleSyncStatus.NEEDS_RECONNECT,
			},
			data: {
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
		return cleared.count;
	} catch (error) {
		console.warn(
			"[auth] a stored mailbox grant did not clear NEEDS_RECONNECT; Check now still clears it",
			error,
		);
		return 0;
	}
}
