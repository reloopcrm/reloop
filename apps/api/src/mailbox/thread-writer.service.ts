import {
	ActivityType,
	type Db,
	EmailDirection,
	type MailboxSyncModel as MailboxSync,
	type Prisma,
	Prisma as PrismaNamespace,
	RecordSource,
} from "@crm/db";
import { THREAD_CLASSIFICATION } from "@crm/db/insights";
import { isAutoReply, isReplySubject } from "@crm/db/message-text";
import type { AgentTaskOrigin } from "@crm/validation/agent-task-payload";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type { SyncOrigin } from "./mailbox.constants";
import {
	MailboxMatchService,
	type MatchContext,
} from "./mailbox-match.service";
import { snippetOf } from "./message-text";
import { type Participant, splitName } from "./participants";

const storedRecipient = z.object({
	email: z.string().trim().min(1),
	name: z.string().nullable().catch(null),
});

const storedRecipients = z.array(z.json()).catch([]);

export type IncomingMessage = {
	rfcMessageId: string;
	rootId: string;
	subject: string | null;
	from: Participant;
	recipients: { email: string; name: string | null; kind: "to" | "cc" }[];
	body: string;
	sentAt: Date;
	gmailMessageId?: string | null;
	outlookMessageId?: string | null;
	outlookWebLink?: string | null;
	imapAccountId?: string | null;
};

@Injectable()
export class ThreadWriterService {
	private readonly logger = new Logger(ThreadWriterService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly stamp: ActivityStampService,
		private readonly agent: AgentTriggerService,
	) {}

	async context(): Promise<MatchContext> {
		const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
			this.match.internalIdentity(),
			this.match.suppressedDomains(),
			this.match.suppressedEmails(),
		]);

		return {
			ourAddresses: internal.addresses,
			ourDomains: internal.domains,
			suppressedDomains,
			suppressedEmails,
		};
	}

	async store(
		row: MailboxSync,
		options: { mailbox: string; origin: SyncOrigin; lane: AgentTaskOrigin },
		parsed: IncomingMessage,
		context: MatchContext,
	): Promise<boolean> {
		const existing = await this.db.emailMessage.findUnique({
			where: { rfcMessageId: parsed.rfcMessageId },
			select: {
				threadId: true,
				thread: {
					select: {
						companyId: true,
						contactId: true,
						activity: { select: { id: true } },
					},
				},
			},
		});
		if (existing?.thread.activity) return false;

		const repair = existing !== null;
		const participants = [parsed.from, ...parsed.recipients];
		const outbound = parsed.from.email === options.mailbox;

		const thread = existing
			? {
					id: existing.threadId,
					companyId: existing.thread.companyId,
					contactId: existing.thread.contactId,
				}
			: await this.db.emailThread.findUnique({
					where: { rootMessageId: parsed.rootId },
					select: { id: true, companyId: true, contactId: true },
				});

		let companyId = thread?.companyId ?? null;
		let contactId = thread?.contactId ?? null;
		const relevantOnly = row.createFrom === "relevant";
		let pending = Boolean(thread) && !companyId && !contactId;

		if (!thread) {
			const repliedTo =
				outbound ||
				(await this.hasOutboundInThread(parsed.rootId, options.mailbox));

			const auto = isAutoReply(parsed.subject, parsed.body);

			const match = await this.match.resolve(
				{
					participants,
					allowCreate:
						row.autoCreate && (repliedTo || (row.createWithoutReply && !auto)),
					source: RecordSource.EMAIL,
					ownerId: row.userId,
				},
				context,
			);

			companyId = match.companyId;
			contactId = match.contactId;

			if (!companyId && !contactId) {
				if (!relevantOnly || match.external.length === 0) return false;
				pending = true;
			}
		}

		let occurredAt: { id: string; at: Date };

		try {
			occurredAt = await this.db.$transaction(async (tx) => {
				const record = existing
					? { id: existing.threadId }
					: await tx.emailThread.upsert({
							where: { rootMessageId: parsed.rootId },
							create: {
								rootMessageId: parsed.rootId,
								subject: parsed.subject,
								companyId,
								contactId,
								classification: pending
									? THREAD_CLASSIFICATION.pending
									: THREAD_CLASSIFICATION.none,
								firstMessageAt: parsed.sentAt,
								lastMessageAt: parsed.sentAt,
								messageCount: 0,
							},
							update: {},
							select: { id: true },
						});

				if (!repair) {
					await tx.emailMessage.create({
						data: {
							threadId: record.id,
							rfcMessageId: parsed.rfcMessageId,
							syncedByUserId: row.userId,
							gmailMessageId: parsed.gmailMessageId ?? null,
							outlookMessageId: parsed.outlookMessageId ?? null,
							outlookWebLink: parsed.outlookWebLink ?? null,
							imapAccountId: parsed.imapAccountId ?? null,
							direction: outbound
								? EmailDirection.OUTBOUND
								: EmailDirection.INBOUND,
							fromEmail: parsed.from.email,
							fromName: parsed.from.name,
							recipients: parsed.recipients,
							subject: parsed.subject,
							snippet: snippetOf(parsed.body),
							body: parsed.body || null,
							sentAt: parsed.sentAt,
						},
					});
				}

				const stats = await tx.emailMessage.aggregate({
					where: { threadId: record.id },
					_count: { _all: true },
					_min: { sentAt: true },
					_max: { sentAt: true },
				});

				const firstMessageAt = stats._min.sentAt ?? parsed.sentAt;
				const lastMessageAt = stats._max.sentAt ?? parsed.sentAt;

				const data: Prisma.EmailThreadUpdateInput = {
					messageCount: stats._count._all,
					firstMessageAt,
					lastMessageAt,
				};

				if (parsed.sentAt <= firstMessageAt) data.subject = parsed.subject;

				await tx.emailThread.update({ where: { id: record.id }, data });

				if (pending) return { id: record.id, at: lastMessageAt };

				return this.project(tx, record.id, row.userId, {
					subject: parsed.subject ?? "(no subject)",
					snippet: snippetOf(parsed.body),
					lastMessageAt,
					companyId,
					contactId,
					origin: options.origin,
				});
			});
		} catch (error) {
			if (await this.storedElsewhere(error, parsed.rfcMessageId)) return false;
			throw error;
		}

		if (!pending) {
			await this.touch(
				{ companyId, contactId },
				occurredAt.at,
				parsed.rfcMessageId,
			);
		}

		await this.agent.threadStored(
			occurredAt.id,
			"New email in the thread",
			options.lane,
		);

		return !repair;
	}

	async adopt(threadId: string, context?: MatchContext): Promise<boolean> {
		const thread = await this.db.emailThread.findUnique({
			where: { id: threadId },
			select: {
				id: true,
				subject: true,
				contactId: true,
				companyId: true,
				lastMessageAt: true,
				messages: {
					orderBy: { sentAt: "asc" },
					select: {
						direction: true,
						subject: true,
						body: true,
						fromEmail: true,
						fromName: true,
						recipients: true,
						snippet: true,
						syncedByUserId: true,
					},
				},
			},
		});

		if (!thread || thread.messages.length === 0) return false;
		if (thread.contactId || thread.companyId) return true;

		if (!hasRealExchange(thread.subject, thread.messages)) {
			await this.db.emailThread.update({
				where: { id: threadId },
				data: { classification: THREAD_CLASSIFICATION.irrelevant },
			});
			return false;
		}

		const ownerId = thread.messages.find(
			(m) => m.syncedByUserId,
		)?.syncedByUserId;
		if (!ownerId) return false;

		const seen = new Set<string>();
		const participants: Participant[] = [];
		for (const message of thread.messages) {
			const people = [
				{ email: message.fromEmail, name: message.fromName },
				...recipientsOf(message.recipients),
			];
			for (const person of people) {
				if (seen.has(person.email)) continue;
				seen.add(person.email);
				participants.push(person);
			}
		}

		const match = await this.match.resolve(
			{
				participants,
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId,
			},
			context ?? (await this.context()),
		);

		let placed = { companyId: match.companyId, contactId: match.contactId };

		if (!placed.companyId && !placed.contactId) {
			const person = match.external[0];
			if (!person) {
				await this.db.emailThread.update({
					where: { id: threadId },
					data: { classification: THREAD_CLASSIFICATION.unplaced },
				});
				return false;
			}

			placed = {
				companyId: null,
				contactId: await this.contactWithoutCompany(person, ownerId),
			};
		}

		const match2 = placed;
		const last = thread.messages.at(-1);

		const occurredAt = await this.db.$transaction(async (tx) => {
			await tx.emailThread.update({
				where: { id: threadId },
				data: { companyId: match2.companyId, contactId: match2.contactId },
			});

			return this.project(tx, threadId, ownerId, {
				subject: thread.subject ?? "(no subject)",
				snippet: last?.snippet ?? null,
				lastMessageAt: thread.lastMessageAt,
				companyId: match2.companyId,
				contactId: match2.contactId,
				origin: "imap",
			});
		});

		await this.touch(
			{ companyId: match2.companyId, contactId: match2.contactId },
			occurredAt.at,
			threadId,
		);

		await this.agent.threadStored(threadId, "Thread adopted into the CRM");

		return true;
	}

	private async contactWithoutCompany(
		person: Participant,
		ownerId: string,
	): Promise<string> {
		const email = person.email.toLowerCase();
		const existing = await this.db.contact.findFirst({
			where: { email, archivedAt: null },
			select: { id: true },
		});
		if (existing) return existing.id;

		const { firstName, lastName } = splitName(person.name, email);
		const created = await this.db.contact.create({
			data: {
				firstName,
				lastName,
				email,
				ownerId,
				source: RecordSource.EMAIL,
			},
			select: { id: true },
		});

		await this.agent.contactCreated(created.id, "Emailed about your business");

		return created.id;
	}

	private async storedElsewhere(
		cause: unknown,
		rfcMessageId: string,
	): Promise<boolean> {
		const duplicate =
			cause instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			cause.code === "P2002";
		if (!duplicate) return false;

		const winner = await this.db.emailMessage.findFirst({
			where: { rfcMessageId, thread: { activity: { isNot: null } } },
			select: { id: true },
		});

		return winner !== null;
	}

	private async touch(
		target: { companyId: string | null; contactId: string | null },
		at: Date,
		rfcMessageId: string,
	): Promise<void> {
		try {
			await this.stamp.touch(target, at);
		} catch (error) {
			this.logger.error(
				{
					message: "An email was stored but its activity stamps were not moved",
					rfcMessageId,
					...target,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async hasOutboundInThread(
		rootMessageId: string,
		mailbox: string,
	): Promise<boolean> {
		const found = await this.db.emailMessage.findFirst({
			where: {
				thread: { rootMessageId },
				fromEmail: mailbox,
			},
			select: { id: true },
		});

		return found !== null;
	}

	private async project(
		tx: Prisma.TransactionClient,
		emailThreadId: string,
		userId: string,
		summary: {
			subject: string;
			snippet: string | null;
			lastMessageAt: Date;
			companyId: string | null;
			contactId: string | null;
			origin: SyncOrigin;
		},
	): Promise<{ id: string; at: Date }> {
		const activity = await tx.activity.upsert({
			where: { emailThreadId },
			create: {
				type: ActivityType.EMAIL,
				subject: summary.subject,
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				createdById: userId,
				emailThreadId,
				meta: { synced: true, source: summary.origin },
			},
			update: {
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
			},
			select: { createdAt: true },
		});

		return { id: emailThreadId, at: activity.createdAt };
	}
}

function recipientsOf(value: Prisma.JsonValue): Participant[] {
	return storedRecipients.parse(value).flatMap((entry) => {
		const parsed = storedRecipient.safeParse(entry);
		if (!parsed.success) return [];

		return [{ email: parsed.data.email.toLowerCase(), name: parsed.data.name }];
	});
}

function hasRealExchange(
	subject: string | null,
	messages: readonly {
		direction: string;
		subject: string | null;
		body: string | null;
		snippet: string | null;
	}[],
): boolean {
	for (const message of messages) {
		const line = message.subject ?? subject;
		if (isAutoReply(line, message.body ?? message.snippet)) continue;
		if (message.direction === "INBOUND") return true;
		if (message.direction === "OUTBOUND" && isReplySubject(line)) return true;
	}

	return false;
}
