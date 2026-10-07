import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
	type Prisma,
} from "@crm/db";
import { planLimitsOf } from "@crm/db/plan-usage";
import type { CapacityUsage, PlanLimits } from "@crm/db/plans";
import { SETTINGS_ID } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { serialiseBackfill, stoppedBackfill } from "./backfill-cursor";
import {
	MAILBOX_SOURCES,
	type MailboxSource,
	PROVIDER_FOR_SOURCE,
	SCOPE_FOR_SOURCE,
} from "./mailbox.constants";

export const SYNC_LEASE_MS = 300_000;

export async function countMailboxes(db: Db): Promise<number> {
	const [synced, imap] = await Promise.all([
		db.mailboxSync.count({
			where: {
				OR: MAILBOX_SOURCES.map((source) => ({
					source,
					user: {
						accounts: {
							some: {
								providerId: PROVIDER_FOR_SOURCE[source],
								scope: { contains: SCOPE_FOR_SOURCE[source] },
							},
						},
					},
				})),
			},
		}),
		db.imapAccount.count(),
	]);
	return synced + imap;
}

export async function readCapacityUsage(db: Db): Promise<CapacityUsage> {
	const [contacts, mailboxes] = await Promise.all([
		db.contact.count({ where: { archivedAt: null } }),
		countMailboxes(db),
	]);
	return { contacts, mailboxes };
}

export function mailboxLimitMessage(limits: PlanLimits): string {
	return `The ${limits.label} plan carries ${limits.mailboxes} mailbox${limits.mailboxes === 1 ? "" : "es"}. Remove one first, or move up a plan.`;
}

@Injectable()
export class SyncStateService {
	private readonly logger = new Logger(SyncStateService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async get(
		userId: string,
		source: MailboxSource,
	): Promise<MailboxSync | null> {
		return this.db.mailboxSync.findUnique({
			where: { userId_source: { userId, source } },
		});
	}

	async listForUser(
		userId: string,
		sources?: readonly MailboxSource[],
	): Promise<MailboxSync[]> {
		const where: Prisma.MailboxSyncWhereInput = { userId };
		if (sources) where.source = { in: [...sources] };

		return this.db.mailboxSync.findMany({ where });
	}

	async due(now: Date): Promise<MailboxSync[]> {
		return this.db.mailboxSync.findMany({
			where: dueWhere(now),
			orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
		});
	}

	async claim(row: MailboxSync, now: Date): Promise<boolean> {
		const { count } = await this.db.mailboxSync.updateMany({
			where: { id: row.id, updatedAt: row.updatedAt, ...dueWhere(now) },
			data: {
				status: GoogleSyncStatus.RUNNING,
				retryAfter: new Date(now.getTime() + SYNC_LEASE_MS),
			},
		});

		return count === 1;
	}

	async release(id: string): Promise<void> {
		await this.db.$transaction([
			this.db.mailboxSync.updateMany({
				where: { id, status: GoogleSyncStatus.RUNNING },
				data: { status: GoogleSyncStatus.IDLE },
			}),
			this.db.mailboxSync.updateMany({
				where: { id },
				data: { retryAfter: null },
			}),
		]);
	}

	async mailboxLimitReached(): Promise<PlanLimits | null> {
		const limits = await planLimitsOf(this.db);
		if (limits.mailboxes === null) return null;
		return (await countMailboxes(this.db)) >= limits.mailboxes ? limits : null;
	}

	async ensure(
		userId: string,
		source: MailboxSource,
		options: {
			autoCreate: boolean;
			createWithoutReply?: boolean;
			createFrom?: string;
		},
	): Promise<MailboxSync | null> {
		if (isMailboxSource(source) && !(await this.get(userId, source))) {
			const limits = await this.mailboxLimitReached();
			if (limits) {
				this.warnMailboxLimit(userId, source, limits);
				return null;
			}
		}

		return this.db.mailboxSync.upsert({
			where: { userId_source: { userId, source } },
			create: {
				userId,
				source,
				status: GoogleSyncStatus.IDLE,
				autoCreate: options.autoCreate,
				createWithoutReply: options.createWithoutReply ?? false,
				createFrom: options.createFrom ?? null,
			},
			update: {
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async admitGranted(row: MailboxSync): Promise<boolean> {
		if (row.lastSyncedAt || !isMailboxSource(row.source)) return true;

		const limits = await planLimitsOf(this.db);
		if (limits.mailboxes === null) return true;
		if ((await countMailboxes(this.db)) <= limits.mailboxes) return true;

		const { count } = await this.db.mailboxSync.deleteMany({
			where: {
				id: row.id,
				status: GoogleSyncStatus.IDLE,
				lastSyncedAt: null,
			},
		});
		if (count === 0) return true;

		this.warnMailboxLimit(row.userId, row.source, limits);
		return false;
	}

	private warnMailboxLimit(
		userId: string,
		source: string,
		limits: PlanLimits,
	): void {
		this.logger.warn({
			message: "Mailbox not connected: the plan's mailbox limit is reached",
			userId,
			source,
			plan: limits.label,
			allowed: limits.mailboxes,
		});
	}

	async markRunning(id: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: { status: GoogleSyncStatus.RUNNING, lastError: null },
		});
	}

	async recordAddress(row: MailboxSync, address: string): Promise<void> {
		if (row.address === address) return;

		await this.db.mailboxSync.update({
			where: { id: row.id },
			data: { address },
		});
	}

	async settle(
		id: string,
		update: {
			cursor?: string | null;
			backfill?: string | null;
			status: GoogleSyncStatus;
		},
	): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				...update,
				lastSyncedAt: new Date(),
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async saveBackfill(id: string, backfill: string | null): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: { backfill },
		});
	}

	async clearCursor(id: string, reason: string): Promise<void> {
		this.logger.warn({
			message: "Sync cursor invalidated. Resuming from now",
			syncId: id,
			reason,
		});

		await this.db.mailboxSync.update({
			where: { id },
			data: {
				cursor: null,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async markNeedsReconnect(id: string, reason: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.NEEDS_RECONNECT,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async markRateLimited(id: string, retryAfterMs: number): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.IDLE,
				retryAfter: new Date(Date.now() + retryAfterMs),
			},
		});
	}

	async markFailed(id: string, reason: string): Promise<void> {
		await this.db.mailboxSync.update({
			where: { id },
			data: {
				status: GoogleSyncStatus.FAILED,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async stopBackfill(userId: string, source: MailboxSource): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: { backfill: serialiseBackfill(stoppedBackfill(new Date())) },
		});
	}

	async setImportSince(
		userId: string,
		source: MailboxSource,
		importSince: Date | null,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: { importSince, backfill: null },
		});
	}

	async setAutoCreate(
		userId: string,
		source: MailboxSource,
		enabled: boolean,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: enabled
				? { autoCreate: true, backfill: null }
				: { autoCreate: false },
		});
		if (enabled) await this.restartThreadContacts();
	}

	private async restartThreadContacts(): Promise<void> {
		await this.db.appSetting.updateMany({
			where: { id: SETTINGS_ID },
			data: { threadContactsCursor: null },
		});
	}

	async setCreatePolicy(
		userId: string,
		source: MailboxSource,
		policy: {
			autoCreate: boolean;
			createWithoutReply: boolean;
			createFrom: string;
		},
	): Promise<void> {
		const creates = policy.autoCreate || policy.createFrom === "relevant";
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: creates ? { ...policy, backfill: null } : policy,
		});
		if (creates) await this.restartThreadContacts();
	}

	async remove(userId: string, source?: MailboxSource): Promise<void> {
		const where: Prisma.MailboxSyncWhereInput = { userId };
		if (source) where.source = source;

		await this.db.mailboxSync.deleteMany({ where });
	}
}

function isMailboxSource(source: string): boolean {
	return (MAILBOX_SOURCES as readonly string[]).includes(source);
}

function dueWhere(now: Date) {
	return {
		status: { notIn: [GoogleSyncStatus.NEEDS_RECONNECT] },
		user: { removedAt: null },
		OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
	};
}
