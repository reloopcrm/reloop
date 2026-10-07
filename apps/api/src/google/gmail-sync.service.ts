import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { planLimitsOf } from "@crm/db/plan-usage";
import { clampImportSince } from "@crm/db/plans";
import type { AgentTaskOrigin } from "@crm/validation/agent-task-payload";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	advancePhase,
	backfillBefore,
	backfillFloor,
	carryFailures,
	finishBackfill,
	isBackfillRunning,
	type MailboxBackfill,
	planBackfill,
	reachedBack,
	readBackfill,
	restartBackfill,
	serialiseBackfill,
} from "../mailbox/backfill-cursor";
import { importCapRemaining } from "../mailbox/import-cap";
import {
	MAILBOX,
	MESSAGE_FAILURES,
	NO_DEADLINE,
	pastDeadline,
} from "../mailbox/mailbox.config";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { FailureLedger } from "../mailbox/message-failures";
import {
	normaliseMessageId,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import {
	GmailClient,
	type GmailMessage,
	SENT_MAIL_QUERY,
	WORK_MAIL_QUERY,
} from "./gmail.client";
import {
	type GmailHeader,
	header,
	plainTextBody,
	rootMessageId,
} from "./gmail-mime";

type MailboxFailure = {
	outcome: string;
	reason: string;
	retryAfterMs?: number;
};

type Ingested = {
	done: Set<string>;
	written: number;
	fetched: number;
	remaining: number;
	oldest: Date | null;
	failure?: MailboxFailure;
};

type Backfilled = {
	written: number;
	backfill: string | null;
	running: boolean;
	failure?: MailboxFailure;
};

export type GmailSyncOutcome = {
	source: "gmail";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	threadsTouched?: number;
	reason?: string;
};

@Injectable()
export class GmailSyncService {
	private readonly logger = new Logger(GmailSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(
		row: MailboxSync,
		deadlineAt: number = NO_DEADLINE,
	): Promise<GmailSyncOutcome> {
		const token = await this.tokens.accessTokenFor(row.userId, "gmail");

		if (token.outcome === "not-connected") {
			return {
				source: "gmail",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.handleFailure(row, profile);
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			await this.state.markFailed(row.id, "Gmail returned no mailbox address.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No mailbox address.",
			};
		}

		await this.state.recordAddress(row, mailbox);

		if (!row.cursor) {
			return this.start(row, profile.data.historyId ?? null);
		}

		return this.incremental(
			row,
			token.accessToken,
			mailbox,
			row.cursor,
			deadlineAt,
		);
	}

	private async start(
		row: MailboxSync,
		historyId: string | null,
	): Promise<GmailSyncOutcome> {
		if (!historyId) {
			await this.state.markFailed(row.id, "Gmail returned no historyId.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No historyId to start from.",
			};
		}

		const plan = planBackfill({
			before: new Date(),
			floor: await this.floorFor(row),
		});

		await this.state.settle(row.id, {
			cursor: historyId,
			backfill: serialiseBackfill(plan),
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message: "Gmail sync started. Reading new mail and the history",
			userId: row.userId,
		});

		return { source: "gmail", userId: row.userId, status: "synced" };
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		startHistoryId: string,
		deadlineAt: number,
	): Promise<GmailSyncOutcome> {
		const stored = readBackfill(row.backfill);
		const ledger = new FailureLedger(
			stored.outcome === "ok" ? stored.backfill.failures : undefined,
		);
		const entries: { id: string | undefined; ids: string[] }[] = [];
		let pageToken: string | undefined;
		let latestHistoryId: string | undefined;
		let more = false;

		for (let page = 1; page <= MAILBOX.sync.gmail.historyPages; page += 1) {
			const history = await this.gmail.listHistory(accessToken, {
				startHistoryId,
				pageToken,
			});

			if (history.outcome === "cursor-invalid") {
				await this.state.clearCursor(row.id, history.reason);

				return {
					source: "gmail",
					userId: row.userId,
					status: "synced",
					reason: "History expired; resuming from now.",
				};
			}

			if (history.outcome !== "ok") {
				return this.handleFailure(row, history);
			}

			for (const entry of history.data.history ?? []) {
				const found: string[] = [];
				for (const added of entry.messagesAdded ?? []) {
					if (added.message?.id) found.push(added.message.id);
				}
				for (const removed of entry.labelsRemoved ?? []) {
					const reentered = (removed.labelIds ?? []).some((label) =>
						MAILBOX.sync.gmail.reenteringLabels.includes(label),
					);
					if (reentered && removed.message?.id) found.push(removed.message.id);
				}
				entries.push({ id: entry.id, ids: found });
			}

			latestHistoryId = history.data.historyId ?? latestHistoryId;
			pageToken = history.data.nextPageToken;
			more = pageToken !== undefined;
			if (!more) break;
		}

		const forward = await this.ingest(
			row,
			accessToken,
			mailbox,
			[...new Set(entries.flatMap((entry) => entry.ids))],
			MAILBOX.sync.forwardMax,
			deadlineAt,
			"forward",
			ledger,
		);

		let cursor = startHistoryId;
		let passed = 0;
		let complete = true;
		for (const [at, entry] of entries.entries()) {
			if (!entry.ids.every((id) => forward.done.has(id))) {
				complete = false;
				break;
			}
			if (entry.id) {
				cursor = entry.id;
				passed = at + 1;
			}
		}
		if (complete && !more && latestHistoryId) {
			cursor = latestHistoryId;
			passed = entries.length;
		}

		const ahead = new Set(entries.slice(passed).flatMap((entry) => entry.ids));
		const behind = new Set(
			entries.slice(0, passed).flatMap((entry) => entry.ids),
		);
		const keepForward = (id: string) =>
			ahead.has(id) || (more && !behind.has(id));

		if (forward.failure) {
			ledger.retain("forward", keepForward);
			await this.state.settle(row.id, {
				cursor,
				backfill: await this.carry(row, row.backfill, ledger),
				status: GoogleSyncStatus.RUNNING,
			});
			return this.handleFailure(row, forward.failure);
		}

		const back = await this.backfill(
			row,
			accessToken,
			mailbox,
			MAILBOX.sync.gmail.maxMessagesPerTick - forward.fetched,
			deadlineAt,
			ledger,
		);

		ledger.retain("forward", keepForward);
		if (!back.running) ledger.retain("backfill", () => false);

		await this.state.settle(row.id, {
			cursor,
			backfill: await this.carry(row, back.backfill, ledger),
			status: GoogleSyncStatus.RUNNING,
		});

		if (back.failure) return this.handleFailure(row, back.failure);

		const written = forward.written + back.written;

		if (written > 0 || forward.remaining > 0) {
			this.logger.log({
				message: "Gmail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				messagesBackfilled: back.written,
				remaining: forward.remaining,
			});
		}

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async backfill(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		budget: number,
		deadlineAt: number,
		ledger: FailureLedger,
	): Promise<Backfilled> {
		const read = readBackfill(row.backfill);

		if (read.outcome === "unreadable") {
			this.logger.warn({
				message: "The stored Gmail backfill is unreadable. Starting a new one",
				userId: row.userId,
				reason: read.reason,
			});
		}

		if (read.outcome === "ok" && !isBackfillRunning(read.backfill)) {
			return { written: 0, backfill: row.backfill, running: false };
		}

		let plan: MailboxBackfill =
			read.outcome === "ok"
				? read.backfill
				: planBackfill({
						before: new Date(),
						floor: await this.floorFor(row),
					});

		let left = budget;
		let written = 0;
		const limits = await planLimitsOf(this.db);

		while (left > 0 && isBackfillRunning(plan) && !pastDeadline(deadlineAt)) {
			const remaining = await importCapRemaining(this.db, limits);
			if (remaining === 0) {
				plan = finishBackfill(plan);
				break;
			}

			const page = await this.gmail.listMessages(accessToken, {
				after: backfillFloor(plan) ?? undefined,
				before: backfillBefore(plan),
				pageToken: plan.position ?? undefined,
				maxResults: MAILBOX.sync.backfillChunk,
				query: plan.phase === "sent" ? SENT_MAIL_QUERY : WORK_MAIL_QUERY,
			});

			if (page.outcome === "cursor-invalid") {
				plan = restartBackfill(plan);
				break;
			}

			if (page.outcome !== "ok") {
				if (
					page.outcome === "failed" &&
					!page.retryable &&
					plan.position !== null
				) {
					plan = restartBackfill(plan);
					break;
				}

				return {
					written,
					backfill: serialiseBackfill(plan),
					running: isBackfillRunning(plan),
					failure: page,
				};
			}

			const ids: string[] = [];
			for (const entry of page.data.messages ?? []) {
				if (entry.id) ids.push(entry.id);
			}

			if (ids.length === 0) {
				plan = advancePhase(plan);
				continue;
			}

			const run = await this.ingest(
				row,
				accessToken,
				mailbox,
				ids,
				Math.min(left, remaining),
				deadlineAt,
				"backfill",
				ledger,
			);
			if (run.oldest) plan = reachedBack(plan, run.oldest);

			written += run.written;
			left -= Math.max(run.fetched, 1);

			if (run.failure) {
				return {
					written,
					backfill: serialiseBackfill(plan),
					running: isBackfillRunning(plan),
					failure: run.failure,
				};
			}

			if (run.remaining > 0) break;

			const next = page.data.nextPageToken ?? null;
			plan = next ? { ...plan, position: next } : advancePhase(plan);
		}

		return {
			written,
			backfill: serialiseBackfill(plan),
			running: isBackfillRunning(plan),
		};
	}

	private async carry(
		row: MailboxSync,
		raw: string | null,
		ledger: FailureLedger,
	): Promise<string | null> {
		return carryFailures(raw, ledger.list(), async () =>
			planBackfill({ before: new Date(), floor: await this.floorFor(row) }),
		);
	}

	private async floorFor(row: MailboxSync): Promise<Date | null> {
		return clampImportSince(
			row.importSince,
			await planLimitsOf(this.db),
			new Date(),
		);
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
		cap: number,
		deadlineAt: number,
		lane: AgentTaskOrigin,
		ledger: FailureLedger,
	): Promise<Ingested> {
		const empty: Ingested = {
			done: new Set<string>(),
			written: 0,
			fetched: 0,
			remaining: 0,
			oldest: null,
		};
		if (ids.length === 0) return empty;

		const alreadyHave = await this.db.emailMessage.findMany({
			where: { gmailMessageId: { in: [...ids] } },
			select: { gmailMessageId: true },
		});
		const seen = new Set(
			alreadyHave.map((existing) => existing.gmailMessageId),
		);

		const done = new Set<string>(
			ids.filter((id) => seen.has(id) || ledger.skip(id, lane)),
		);
		const pending = ids.filter((id) => !done.has(id));
		const batch = pending.slice(0, Math.max(cap, 0));
		const remaining = pending.length - batch.length;

		if (batch.length === 0) return { ...empty, done, remaining };

		const context: MatchContext = await this.threads.context(mailbox);

		let written = 0;
		let fetched = 0;
		let oldest: Date | null = null;

		for (const id of batch) {
			if (pastDeadline(deadlineAt)) break;

			const message = await this.gmail.getMessage(accessToken, id);

			if (
				message.outcome === "rate-limited" ||
				message.outcome === "unauthorized"
			) {
				return {
					done,
					written,
					fetched,
					remaining: remaining + batch.length - fetched,
					oldest,
					failure: message,
				};
			}

			fetched += 1;
			if (message.outcome !== "failed" || !message.retryable) done.add(id);
			if (message.outcome !== "ok") continue;
			if (this.skipped(message.data)) continue;

			const parsed = this.parse(message.data);
			if (!parsed) continue;

			if (!oldest || parsed.sentAt < oldest) oldest = parsed.sentAt;

			try {
				const stored = await this.threads.store(
					row,
					{ origin: "gmail", lane },
					parsed,
					context,
				);
				if (stored) written += 1;
				ledger.clear(id);
			} catch (error) {
				const attempts = ledger.record(id, lane);
				if (attempts < MESSAGE_FAILURES.maxAttempts) {
					await this.state.saveBackfill(
						row.id,
						await this.carry(row, row.backfill, ledger),
					);
					throw error;
				}

				this.logger.warn({
					message:
						"A Gmail message could not be stored after repeated attempts. It is skipped",
					mailboxId: row.id,
					providerMessageId: id,
					attempts,
				});
				done.add(id);
			}
		}

		return {
			done,
			written,
			fetched,
			remaining: remaining + batch.length - fetched,
			oldest,
		};
	}

	private skipped(message: GmailMessage): boolean {
		return (message.labelIds ?? []).some((label) =>
			MAILBOX.sync.gmail.skippedLabels.includes(label),
		);
	}

	private parse(message: GmailMessage): IncomingMessage | null {
		const headers = message.payload?.headers;

		const rawMessageId = header(headers, "message-id");
		if (!rawMessageId) return null;

		const from = parseAddress(header(headers, "from") ?? "");
		if (!from) return null;

		const sentAt = this.sentAt(message, headers);
		if (!sentAt) return null;

		const rootId = rootMessageId(headers) ?? normaliseMessageId(rawMessageId);

		const to = parseAddressList(header(headers, "to")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "to" as const,
		}));

		const cc = parseAddressList(header(headers, "cc")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "cc" as const,
		}));

		const body = stripQuotedHistory(plainTextBody(message.payload));

		return {
			rfcMessageId: normaliseMessageId(rawMessageId),
			rootId,
			subject: header(headers, "subject"),
			from,
			recipients: [...to, ...cc],
			body,
			sentAt,
			gmailMessageId: message.id ?? null,
		};
	}

	private sentAt(
		message: GmailMessage,
		headers: readonly GmailHeader[] | undefined,
	): Date | null {
		if (message.internalDate) {
			const at = new Date(Number(message.internalDate));
			if (!Number.isNaN(at.getTime())) return at;
		}

		const raw = header(headers, "date");
		if (!raw) return null;

		const at = new Date(raw);
		return Number.isNaN(at.getTime()) ? null : at;
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
	): Promise<GmailSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return {
				source: "gmail",
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source: "gmail",
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}
}
