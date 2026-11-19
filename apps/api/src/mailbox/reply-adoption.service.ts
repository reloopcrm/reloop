import { type Db, Prisma } from "@crm/db";
import { REPLY_PREFIX } from "@crm/db/message-text";
import { SAMPLE_ID_PATTERN } from "@crm/db/sample-data";
import { SETTINGS_ID } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { NO_DEADLINE, pastDeadline, REPLY_ADOPTION } from "./mailbox.config";
import { MailboxMatchService } from "./mailbox-match.service";
import type { ReplySkip } from "./reply-adoption";
import {
	freshReplyAdoptionCursor,
	onDay,
	type ReplyAdoptionCursor,
	type ReplyAdoptionPosition,
	readReplyAdoptionCursor,
	replyPositionOf,
	serialiseReplyAdoptionCursor,
} from "./reply-adoption-cursor";
import { ThreadWriterService } from "./thread-writer.service";

type WaitingReply = { id: string; at: string };

type PassStop = "deadline" | "creates" | "limit";

export type ReplyAdoptionOptions = {
	batch: number;
	maxCreatesPerTick: number;
	maxContactsPerDay: number;
	restMs: number;
};

@Injectable()
export class ReplyAdoptionService {
	private readonly logger = new Logger(ReplyAdoptionService.name);
	private options: ReplyAdoptionOptions = { ...REPLY_ADOPTION };

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly threads: ThreadWriterService,
	) {}

	tune(options: Partial<ReplyAdoptionOptions>): this {
		this.options = { ...this.options, ...options };
		return this;
	}

	async adoptReplies(
		now: Date = new Date(),
		deadlineAt: number = NO_DEADLINE,
	): Promise<number> {
		const owners = await this.match.creatingOwners();
		if (owners.size === 0) return 0;

		const stored = await this.readStored();
		const cursor = onDay(this.parse(stored, now), now);
		if (cursor.restUntil && new Date(cursor.restUntil) > now) return 0;

		const room = Math.min(
			this.options.maxCreatesPerTick,
			this.options.maxContactsPerDay - cursor.created,
		);
		if (room <= 0) return 0;

		const held = serialiseReplyAdoptionCursor({
			...cursor,
			created: cursor.created + room,
		});
		if (!(await this.swap(stored, held))) return 0;

		const rows = await this.waitingAfter(replyPositionOf(cursor));
		const context = await this.threads.context();

		let created = 0;
		let adopted = 0;
		let failed = 0;
		let reached: WaitingReply | null = null;
		let stopped: PassStop | null = null;
		const skipped: Partial<Record<ReplySkip, number>> = {};

		for (const row of rows) {
			if (pastDeadline(deadlineAt)) {
				stopped = "deadline";
				break;
			}
			if (created >= room) {
				stopped = "creates";
				break;
			}

			try {
				const outcome = await this.threads.adoptReply(row.id, context, owners);
				if (outcome.status === "limited") {
					stopped = "limit";
					break;
				}
				if (outcome.status === "adopted") {
					adopted += 1;
					if (outcome.created) created += 1;
				} else {
					skipped[outcome.reason] = (skipped[outcome.reason] ?? 0) + 1;
				}
			} catch (error) {
				failed += 1;
				this.logger.error(
					{
						message:
							"A reply to our own mail could not be filed. The pass moves on and tries it again after the rest",
						threadId: row.id,
					},
					error instanceof Error ? error.stack : String(error),
				);
			}

			reached = row;
		}

		const finished = stopped === null && rows.length < this.options.batch;
		const position = reached
			? { at: reached.at, id: reached.id }
			: replyPositionOf(cursor);

		await this.swap(
			held,
			serialiseReplyAdoptionCursor({
				...cursor,
				created: cursor.created + created,
				at: finished ? null : (position?.at ?? null),
				id: finished ? null : (position?.id ?? null),
				restUntil: finished
					? new Date(now.getTime() + this.options.restMs).toISOString()
					: null,
			}),
		);

		if (adopted > 0 || failed > 0 || Object.keys(skipped).length > 0) {
			this.logger.log({
				message: "Replies to our own mail were filed under their senders",
				threads: rows.length,
				adopted,
				created,
				createdToday: cursor.created + created,
				skipped,
				failed,
				stoppedBy: stopped,
				finished,
			});
		}

		return created;
	}

	private parse(stored: string | null, now: Date): ReplyAdoptionCursor {
		const read = readReplyAdoptionCursor(stored);
		if (read.outcome === "ok") return read.cursor;
		if (read.outcome === "unreadable") {
			this.logger.warn({
				message:
					"The reply adoption cursor is unreadable. The pass starts again from the newest thread and counts the day from zero",
				reason: read.reason,
			});
		}
		return freshReplyAdoptionCursor(now);
	}

	private async readStored(): Promise<string | null> {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { replyAdoptionCursor: true },
		});
		if (settings) return settings.replyAdoptionCursor;

		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID },
			update: {},
		});
		return null;
	}

	private async swap(from: string | null, to: string): Promise<boolean> {
		const { count } = await this.db.appSetting.updateMany({
			where: { id: SETTINGS_ID, replyAdoptionCursor: from },
			data: { replyAdoptionCursor: to },
		});
		return count === 1;
	}

	private waitingAfter(
		after: ReplyAdoptionPosition | null,
	): Promise<WaitingReply[]> {
		const position = after
			? Prisma.sql`AND (t."lastMessageAt", t.id) < ((${after.at}::timestamptz AT TIME ZONE 'UTC'), ${after.id})`
			: Prisma.empty;

		return this.db.$queryRaw<WaitingReply[]>`
			SELECT t.id,
				to_char(t."lastMessageAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
			FROM "emailThread" t
			WHERE t."contactId" IS NULL
				AND t.id NOT LIKE ${SAMPLE_ID_PATTERN}
				AND NOT EXISTS (
					SELECT 1 FROM "emailMessage" o
					WHERE o."threadId" = t.id AND o.direction = 'OUTBOUND'
				)
				AND EXISTS (
					SELECT 1 FROM "emailMessage" m
					WHERE m."threadId" = t.id
						AND m.direction = 'INBOUND'
						AND m."realAnswer" IS DISTINCT FROM false
						AND COALESCE(m.subject, t.subject) ~* ${REPLY_PREFIX.source}
				)
				${position}
			ORDER BY t."lastMessageAt" DESC, t.id DESC
			LIMIT ${this.options.batch}
		`;
	}
}
