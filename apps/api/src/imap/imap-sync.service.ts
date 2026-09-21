import {
	type Db,
	GoogleSyncStatus,
	type ImapAccountModel as ImapAccount,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { clampImportSince, limitsOf } from "@crm/db/plans";
import { readPlan } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { importCapReached } from "../mailbox/import-cap";
import {
	type ImapSyncSource,
	imapAccountIdOf,
	isImapSyncSource,
} from "../mailbox/mailbox.constants";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import { ThreadWriterService } from "../mailbox/thread-writer.service";
import {
	ImapClientFactory,
	type ImapFolder,
	type ImapSession,
} from "./imap.client";
import { IMAP } from "./imap.config";
import { ImapCredentialService } from "./imap-credentials";
import {
	type ImapCursor,
	type ImapFolderCursor,
	parseImapCursor,
	serialiseImapCursor,
} from "./imap-cursor";
import { planFolders } from "./imap-folders";
import { parseImapMessage } from "./imap-message";

export type ImapSyncOutcome = {
	source: ImapSyncSource;
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "failed";
	messagesWritten?: number;
	reason?: string;
};

type Ingest = { seen: number; written: number };

type FolderRun = {
	session: ImapSession;
	row: MailboxSync;
	account: ImapAccount;
	folder: ImapFolder;
	uidValidity: string;
	mailbox: string;
	context: MatchContext;
};

@Injectable()
export class ImapSyncService {
	private readonly logger = new Logger(ImapSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly clients: ImapClientFactory,
		private readonly credentials: ImapCredentialService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async runOne(userId: string, source: ImapSyncSource) {
		const row = await this.state.get(userId, source);
		if (!row) return null;

		return this.sync(row);
	}

	async sync(row: MailboxSync): Promise<ImapSyncOutcome> {
		if (!isImapSyncSource(row.source)) {
			return {
				source: row.source as ImapSyncSource,
				userId: row.userId,
				status: "skipped",
				reason: "Not an IMAP source.",
			};
		}

		const source = row.source;
		const account = await this.db.imapAccount.findUnique({
			where: { id: imapAccountIdOf(source) },
		});

		if (!account || account.userId !== row.userId) {
			await this.state.remove(row.userId, source);
			return {
				source,
				userId: row.userId,
				status: "skipped",
				reason: "The mailbox was removed.",
			};
		}

		await this.state.markRunning(row.id);

		const connected = await this.clients.connect({
			host: account.host,
			port: account.port,
			secure: account.secure,
			username: account.username,
			password: this.credentials.open(account.secret),
		});

		if (connected.outcome === "auth") {
			await this.state.markNeedsReconnect(row.id, connected.reason);
			return {
				source,
				userId: row.userId,
				status: "reconnect",
				reason: connected.reason,
			};
		}

		if (connected.outcome !== "ok") {
			await this.state.markFailed(row.id, connected.reason);
			return {
				source,
				userId: row.userId,
				status: "failed",
				reason: connected.reason,
			};
		}

		const session = connected.session;
		const cursor = parseImapCursor(row.cursor);

		try {
			const written = await this.walk(session, row, account, cursor);

			await this.state.settle(row.id, {
				cursor: serialiseImapCursor(cursor),
				status: GoogleSyncStatus.IDLE,
			});

			if (written > 0) {
				this.logger.log({
					message: "IMAP sync wrote messages",
					userId: row.userId,
					accountId: account.id,
					messagesWritten: written,
				});
			}

			return {
				source,
				userId: row.userId,
				status: "synced",
				messagesWritten: written,
			};
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);

			await this.db.mailboxSync.update({
				where: { id: row.id },
				data: { cursor: serialiseImapCursor(cursor) },
			});
			await this.state.markFailed(row.id, reason);

			this.logger.error(
				{
					message: "IMAP sync failed",
					userId: row.userId,
					accountId: account.id,
				},
				error instanceof Error ? error.stack : String(error),
			);

			return { source, userId: row.userId, status: "failed", reason };
		} finally {
			await session.close();
		}
	}

	private async walk(
		session: ImapSession,
		row: MailboxSync,
		account: ImapAccount,
		cursor: ImapCursor,
	): Promise<number> {
		const mailbox = account.email.toLowerCase();
		const base = await this.threads.context();
		const context: MatchContext = {
			...base,
			ourAddresses: new Set([...base.ourAddresses, mailbox]),
		};

		let budget = IMAP.sync.maxMessagesPerTick;
		let written = 0;

		const limits = limitsOf(await readPlan(this.db));
		const importSince = clampImportSince(
			account.importSince,
			limits,
			new Date(),
		);

		const plan = planFolders(await session.folders());

		for (const folder of plan) {
			if (budget <= 0) break;

			const opened = await session.open(folder.path);
			const newest = opened.uidNext - 1;

			let entry = cursor.folders[folder.path];

			if (!entry || entry.uidValidity !== opened.uidValidity) {
				const floorUid = importSince
					? await floorUidFor(session, importSince, newest)
					: 1;

				entry = {
					uidValidity: opened.uidValidity,
					lastUid: Math.max(newest, 0),
					backfillUid: newest >= floorUid ? newest : null,
					floorUid,
				};
			}

			const run: FolderRun = {
				session,
				row,
				account,
				folder,
				uidValidity: opened.uidValidity,
				mailbox,
				context,
			};

			while (entry.lastUid < newest && budget > 0) {
				const from = entry.lastUid + 1;
				const to = Math.min(newest, from + IMAP.sync.forwardChunk - 1);

				const result = await this.ingest(run, `${from}:${to}`);
				budget -= Math.max(result.seen, 1);
				written += result.written;
				entry.lastUid = to;
			}

			while (entry.backfillUid !== null && budget > 0) {
				if (await importCapReached(this.db, limits)) {
					entry.backfillUid = null;
					break;
				}

				const to = entry.backfillUid;
				const from = Math.max(entry.floorUid, to - IMAP.sync.backfillChunk + 1);

				const result = await this.ingest(run, `${from}:${to}`);
				budget -= Math.max(result.seen, 1);
				written += result.written;
				entry.backfillUid = from > entry.floorUid ? from - 1 : null;
			}

			cursor.folders[folder.path] = entry satisfies ImapFolderCursor;
		}

		return written;
	}

	private async ingest(run: FolderRun, range: string): Promise<Ingest> {
		let seen = 0;
		let written = 0;

		for await (const raw of run.session.fetch(range)) {
			seen += 1;

			let parsed: Awaited<ReturnType<typeof parseImapMessage>>;
			try {
				parsed = await parseImapMessage(raw, {
					accountId: run.account.id,
					folder: run.folder.path,
					uidValidity: run.uidValidity,
				});
			} catch (error) {
				this.logger.warn({
					message: "An IMAP message could not be parsed and was skipped",
					accountId: run.account.id,
					uid: raw.uid,
					reason: error instanceof Error ? error.message : String(error),
				});
				continue;
			}

			if (!parsed) continue;

			const stored = await this.threads.store(
				run.row,
				{ mailbox: run.mailbox, origin: "imap" },
				parsed,
				run.context,
			);
			if (stored) written += 1;
		}

		return { seen, written };
	}
}

async function floorUidFor(
	session: ImapSession,
	since: Date,
	newest: number,
): Promise<number> {
	const uids = await session.uidsSince(since);
	if (uids.length === 0) return newest + 1;

	return Math.max(1, Math.min(...uids));
}
