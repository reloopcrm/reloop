import { type Db, Prisma, RecordSource } from "@crm/db";
import { AUTO_REPLY_BODY_CHARS } from "@crm/db/message-text";
import { limitsOf } from "@crm/db/plans";
import { SAMPLE_ID_PATTERN } from "@crm/db/sample-data";
import { readPlan, SETTINGS_ID } from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { THREAD_CONTACTS } from "./mailbox.config";
import { MailboxMatchService } from "./mailbox-match.service";
import {
	type CreatePolicy,
	planThread,
	type SenderOutcome,
	type SenderVerdict,
	type ThreadMessage,
	type ThreadPlan,
	type ThreadSkip,
} from "./thread-contacts";
import {
	readThreadContactsCursor,
	serialiseThreadContactsCursor,
	type ThreadContactsCursor,
} from "./thread-contacts-cursor";
import { recipientsOf, ThreadWriterService } from "./thread-writer.service";

type ChangedThread = { id: string; changedAt: string };

type KnownContact = { id: string; archivedAt: Date | null };

const isoInstant = z.iso.datetime().transform((value) => new Date(value));

const scannedMessage = z.object({
	threadId: z.string(),
	direction: z.enum(["INBOUND", "OUTBOUND"]),
	fromEmail: z.string(),
	fromName: z.string().nullable(),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	snippet: z.string().nullable(),
	syncedByUserId: z.string().nullable(),
	sentAt: isoInstant,
	recipients: z.json(),
});

const scannedMessages = z.array(scannedMessage);

type ScannedThread = {
	row: ChangedThread;
	threadContactId: string | null;
	plan: ThreadPlan;
};

export type ThreadContactsPreview = {
	threads: number;
	threadSkips: Record<ThreadSkip, number>;
	senders: Record<SenderVerdict, number>;
	createByDomain: Record<string, number>;
	activeContacts: number;
	contactLimit: number | null;
};

export type ThreadContactsOptions = { batch: number; settleMs: number };

const CHANGED_AT = Prisma.sql`GREATEST(t."updatedAt", i."updatedAt")`;

@Injectable()
export class ThreadContactsService {
	private readonly logger = new Logger(ThreadContactsService.name);
	private options: ThreadContactsOptions = {
		batch: THREAD_CONTACTS.batch,
		settleMs: THREAD_CONTACTS.settleMs,
	};

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly threads: ThreadWriterService,
		private readonly stamp: ActivityStampService,
	) {}

	tune(options: Partial<ThreadContactsOptions>): this {
		this.options = { ...this.options, ...options };
		return this;
	}

	async addFromRelevantThreads(): Promise<number> {
		const creatingOwners = await this.creatingOwners();
		if (creatingOwners.size === 0) return 0;

		const after = await this.readCursor();
		const rows = await this.changedThreads(
			after,
			this.options.settleMs,
			this.options.batch,
		);
		if (rows.length === 0) return 0;

		const policy: CreatePolicy = {
			context: await this.threads.context(),
			creatingOwners,
		};
		const scanned = await this.scan(rows, policy);
		const known = await this.knownAddresses(scanned);

		let created = 0;
		const domains = new Set<string>();
		let reached: ChangedThread | null = null;
		let limitChecked = false;
		let limited = false;

		for (const thread of scanned) {
			const wanted = wantedSenders(thread, known);
			if (wanted.length > 0 && !limitChecked) {
				limitChecked = true;
				if (await this.match.contactLimitReached()) {
					limited = true;
					break;
				}
			}

			try {
				await this.stampKnownSenders(thread, known);
				const outcome = await this.addSenders(thread, wanted, known);
				created += outcome.created;
				for (const domain of outcome.domains) domains.add(domain);
				if (outcome.limited) {
					limited = true;
					break;
				}
			} catch (error) {
				this.logger.error(
					{
						message: "Senders of a relevant thread could not be added",
						threadId: thread.row.id,
					},
					error instanceof Error ? error.stack : String(error),
				);
			}

			reached = thread.row;
		}

		if (reached) await this.writeCursor(reached);

		if (created > 0) {
			this.logger.log({
				message: "Senders of relevant threads were added as contacts",
				created,
				senderDomains: domains.size,
				threads: scanned.length,
				stoppedAtLimit: limited,
			});
		}

		return created;
	}

	private async addSenders(
		thread: ScannedThread,
		wanted: readonly SenderOutcome[],
		known: Map<string, KnownContact>,
	): Promise<{ created: number; domains: string[]; limited: boolean }> {
		const outcome = { created: 0, domains: [] as string[], limited: false };
		const companyId = thread.plan.companyId;
		if (!companyId) return outcome;

		let slot = thread.threadContactId;

		for (const sender of wanted) {
			if (!sender.ownerId) continue;

			const added = await this.match.addCompanyContact(
				{ email: sender.email, name: sender.name },
				companyId,
				{ source: RecordSource.EMAIL, ownerId: sender.ownerId },
			);
			if (added.limited) return { ...outcome, limited: true };

			if (!added.contactId) continue;
			known.set(sender.email, { id: added.contactId, archivedAt: null });

			if (added.created) {
				outcome.created += 1;
				if (sender.domain) outcome.domains.push(sender.domain);
			}
			if (!slot) {
				await this.fillEmptySlot(thread.row.id, added.contactId);
				slot = added.contactId;
			}
		}

		return outcome;
	}

	private async stampKnownSenders(
		thread: ScannedThread,
		known: ReadonlyMap<string, KnownContact>,
	): Promise<void> {
		for (const sender of thread.plan.senders) {
			if (sender.verdict !== "create") continue;
			const contact = known.get(sender.email);
			if (!contact || contact.archivedAt) continue;
			if (contact.id === thread.threadContactId) continue;
			await this.stamp.touch({ contactId: contact.id }, sender.lastMailAt);
		}
	}

	async preview(): Promise<ThreadContactsPreview> {
		const creatingOwners = await this.creatingOwners();
		const policy: CreatePolicy = {
			context: await this.threads.context(),
			creatingOwners,
		};

		const preview: ThreadContactsPreview = {
			threads: 0,
			threadSkips: { "no-company-domain": 0, "archived-company": 0 },
			senders: {
				create: 0,
				own: 0,
				suppressed: 0,
				automated: 0,
				"free-mail": 0,
				"auto-reply": 0,
				"other-domain": 0,
				"policy-off": 0,
				known: 0,
			},
			createByDomain: {},
			activeContacts: await this.db.contact.count({
				where: { archivedAt: null },
			}),
			contactLimit: limitsOf(await readPlan(this.db)).contacts,
		};

		const verdicts = new Map<string, SenderOutcome>();
		let after: ThreadContactsCursor | null = null;

		for (;;) {
			const rows = await this.changedThreads(
				after,
				0,
				THREAD_CONTACTS.previewPage,
			);
			if (rows.length === 0) break;

			const scanned = await this.scan(rows, policy);
			for (const thread of scanned) {
				preview.threads += 1;
				if (thread.plan.skip) {
					preview.threadSkips[thread.plan.skip] += 1;
					continue;
				}
				for (const sender of thread.plan.senders) {
					const seen = verdicts.get(sender.email);
					if (
						!seen ||
						(seen.verdict !== "create" && sender.verdict === "create")
					) {
						verdicts.set(sender.email, sender);
					}
				}
			}

			const last = rows.at(-1);
			if (!last) break;
			after = { v: 1, at: last.changedAt, id: last.id };
		}

		const known = await this.existingContacts([...verdicts.keys()]);

		for (const sender of verdicts.values()) {
			if (known.has(sender.email)) {
				preview.senders.known += 1;
				continue;
			}
			preview.senders[sender.verdict] += 1;
			if (sender.verdict === "create" && sender.domain) {
				preview.createByDomain[sender.domain] =
					(preview.createByDomain[sender.domain] ?? 0) + 1;
			}
		}

		return preview;
	}

	private async creatingOwners(): Promise<Set<string>> {
		const rows = await this.db.mailboxSync.findMany({
			where: {
				source: { not: "calendar" },
				user: { removedAt: null },
				OR: [{ autoCreate: true }, { createFrom: "relevant" }],
			},
			select: { userId: true },
		});

		return new Set(rows.map((row) => row.userId));
	}

	private async readCursor(): Promise<ThreadContactsCursor | null> {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { threadContactsCursor: true },
		});
		const read = readThreadContactsCursor(settings?.threadContactsCursor);
		if (read.outcome === "ok") return read.cursor;
		if (read.outcome === "unreadable") {
			this.logger.warn({
				message:
					"The thread contacts cursor is unreadable. The pass starts again from the oldest thread",
				reason: read.reason,
			});
		}
		return null;
	}

	private async writeCursor(row: ChangedThread): Promise<void> {
		const value = serialiseThreadContactsCursor({
			v: 1,
			at: row.changedAt,
			id: row.id,
		});
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, threadContactsCursor: value },
			update: { threadContactsCursor: value },
		});
	}

	private changedThreads(
		after: ThreadContactsCursor | null,
		settleMs: number,
		take: number,
	): Promise<ChangedThread[]> {
		const position = after
			? Prisma.sql`AND (${CHANGED_AT}, t.id) > ((${after.at}::timestamptz AT TIME ZONE 'UTC'), ${after.id})`
			: Prisma.empty;

		return this.db.$queryRaw<ChangedThread[]>`
			SELECT t.id,
				to_char(${CHANGED_AT}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "changedAt"
			FROM "emailThread" t
			JOIN "threadInsight" i ON i."threadId" = t.id
			WHERE i.relevant = true
				AND (t."companyId" IS NOT NULL OR t."contactId" IS NOT NULL)
				AND t.id NOT LIKE ${SAMPLE_ID_PATTERN}
				AND ${CHANGED_AT} <= (now() AT TIME ZONE 'UTC') - (${settleMs} * interval '1 millisecond')
				${position}
			ORDER BY ${CHANGED_AT}, t.id
			LIMIT ${take}
		`;
	}

	private async scan(
		rows: readonly ChangedThread[],
		policy: CreatePolicy,
	): Promise<ScannedThread[]> {
		const ids = rows.map((row) => row.id);
		const [details, messages] = await Promise.all([
			this.db.emailThread.findMany({
				where: { id: { in: ids } },
				select: {
					id: true,
					subject: true,
					contactId: true,
					company: { select: { id: true, domain: true, archivedAt: true } },
					contact: {
						select: {
							company: {
								select: { id: true, domain: true, archivedAt: true },
							},
						},
					},
				},
			}),
			this.messagesOf(ids),
		]);
		const byId = new Map(details.map((thread) => [thread.id, thread]));
		const mail = new Map<string, ThreadMessage[]>();
		for (const message of messages) {
			const list = mail.get(message.threadId) ?? [];
			list.push(message);
			mail.set(message.threadId, list);
		}

		return rows.flatMap((row) => {
			const thread = byId.get(row.id);
			if (!thread) return [];

			return [
				{
					row,
					threadContactId: thread.contactId,
					plan: planThread(
						{
							subject: thread.subject,
							company: thread.company ?? thread.contact?.company ?? null,
							messages: mail.get(row.id) ?? [],
						},
						policy,
					),
				},
			];
		});
	}

	private async messagesOf(
		threadIds: readonly string[],
	): Promise<(ThreadMessage & { threadId: string })[]> {
		if (threadIds.length === 0) return [];

		const raw = await this.db.$queryRaw<unknown[]>`
			SELECT m."threadId",
				m.direction::text AS direction,
				m."fromEmail",
				m."fromName",
				m.subject,
				left(m.body, ${AUTO_REPLY_BODY_CHARS}) AS body,
				m.snippet,
				m."syncedByUserId",
				to_char(m."sentAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sentAt",
				CASE WHEN m.direction = 'OUTBOUND' THEN m.recipients ELSE '[]'::jsonb END AS recipients
			FROM "emailMessage" m
			WHERE m."threadId" IN (${Prisma.join(threadIds)})
			ORDER BY m."threadId", m."sentAt"
		`;

		return scannedMessages.parse(raw).map((message) => ({
			...message,
			recipients: recipientsOf(message.recipients as Prisma.JsonValue).map(
				(person) => person.email,
			),
		}));
	}

	private async knownAddresses(
		scanned: readonly ScannedThread[],
	): Promise<Map<string, KnownContact>> {
		const emails = scanned.flatMap((thread) =>
			thread.plan.senders
				.filter((sender) => sender.verdict === "create")
				.map((sender) => sender.email),
		);
		return this.existingContacts(emails);
	}

	private async existingContacts(
		emails: string[],
	): Promise<Map<string, KnownContact>> {
		const known = new Map<string, KnownContact>();
		if (emails.length === 0) return known;

		const rows = await this.db.contact.findMany({
			where: { email: { in: [...new Set(emails)] } },
			orderBy: { archivedAt: { sort: "asc", nulls: "first" } },
			select: { id: true, email: true, archivedAt: true },
		});
		for (const row of rows) {
			const email = row.email?.toLowerCase();
			if (email && !known.has(email)) {
				known.set(email, { id: row.id, archivedAt: row.archivedAt });
			}
		}

		return known;
	}

	private async fillEmptySlot(
		threadId: string,
		contactId: string,
	): Promise<void> {
		const [filled] = await this.db.$transaction([
			this.db.emailThread.updateMany({
				where: { id: threadId, contactId: null },
				data: { contactId },
			}),
			this.db.activity.updateMany({
				where: { emailThreadId: threadId, contactId: null },
				data: { contactId },
			}),
		]);
		if (filled.count === 0) return;

		const activity = await this.db.activity.findUnique({
			where: { emailThreadId: threadId },
			select: { createdAt: true },
		});
		if (activity) await this.stamp.touch({ contactId }, activity.createdAt);
	}
}

function wantedSenders(
	thread: ScannedThread,
	known: ReadonlyMap<string, KnownContact>,
): SenderOutcome[] {
	return thread.plan.senders.filter(
		(sender) => sender.verdict === "create" && !known.has(sender.email),
	);
}
