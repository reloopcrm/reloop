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
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type { SyncOrigin } from "./mailbox.constants";
import {
	type ContactResearch,
	contactLimitError,
	MailboxMatchService,
	type MatchContext,
} from "./mailbox-match.service";
import { snippetOf } from "./message-text";
import { isOwnAddress, type Participant, splitName } from "./participants";
import { recipientsOf } from "./thread-messages";
import {
	type LinkOutcome,
	ThreadParticipantsService,
} from "./thread-participants.service";

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
		private readonly participants: ThreadParticipantsService,
	) {}

	context(mailbox?: string): Promise<MatchContext> {
		return this.participants.context(mailbox);
	}

	async store(
		row: MailboxSync,
		options: { origin: SyncOrigin; lane: AgentTaskOrigin },
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

		const startedAt = new Date();
		const repair = existing !== null;
		const participants = [parsed.from, ...parsed.recipients];
		const outbound = isOwnAddress(parsed.from.email, context);

		if (!repair && !outbound) {
			await this.match.reviveContact(parsed.from, context, {
				lane: options.lane,
				sentAt: parsed.sentAt,
			});
		}

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
		let research: ContactResearch[] = [];

		if (!thread) {
			const repliedTo =
				outbound || (await this.hasOutboundInThread(parsed.rootId, context));

			const auto = isAutoReply(parsed.subject, parsed.body);

			const match = await this.match.resolve(
				{
					participants,
					allowCreate:
						row.autoCreate && (repliedTo || (row.createWithoutReply && !auto)),
					source: RecordSource.EMAIL,
					ownerId: row.userId,
					deferResearch: true,
				},
				context,
			);

			companyId = match.companyId;
			contactId = match.contactId;
			research = match.research ?? [];

			if (!companyId && !contactId) {
				const held = match.limited === true;
				if (!held && (!relevantOnly || match.external.length === 0)) {
					return false;
				}
				pending = true;
			}
		}

		let occurredAt: { id: string; at: Date; links: LinkOutcome };

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

				if (pending) {
					const links = await this.participants.linkThread(
						record.id,
						context,
						tx,
					);
					return { id: record.id, at: lastMessageAt, links };
				}

				const projected = await this.project(tx, record.id, row.userId, {
					subject: parsed.subject ?? "(no subject)",
					snippet: snippetOf(parsed.body),
					lastMessageAt,
					companyId,
					contactId,
					origin: options.origin,
				});
				const links = await this.participants.linkThread(
					record.id,
					context,
					tx,
				);
				return { ...projected, links };
			});
		} catch (error) {
			if (await this.storedElsewhere(error, parsed.rfcMessageId)) return false;
			throw error;
		}

		await this.match.queueResearch(research);

		if (!pending) {
			await this.touch(
				{ companyId, contactId },
				occurredAt.at,
				parsed.rfcMessageId,
			);
		}
		await this.participants.settle(occurredAt.links);
		await this.linkNewContact(contactId, startedAt, context);

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

		const startedAt = new Date();

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

		const known = context ?? (await this.context());
		const match = await this.match.resolve(
			{
				participants,
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId,
			},
			known,
		);

		if (match.limited) return false;

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

			const contactId = await this.contactWithoutCompany(
				person,
				ownerId,
				known,
			);
			if (!contactId) return false;

			placed = { companyId: null, contactId };
		}

		if (
			placed.contactId &&
			!(await this.visible(placed.contactId, known, thread.lastMessageAt))
		) {
			return false;
		}

		const match2 = placed;
		const last = thread.messages.at(-1);

		const occurredAt = await this.db.$transaction(async (tx) => {
			await tx.emailThread.update({
				where: { id: threadId },
				data: { companyId: match2.companyId, contactId: match2.contactId },
			});

			const projected = await this.project(tx, threadId, ownerId, {
				subject: thread.subject ?? "(no subject)",
				snippet: last?.snippet ?? null,
				lastMessageAt: thread.lastMessageAt,
				companyId: match2.companyId,
				contactId: match2.contactId,
				origin: "imap",
			});
			const links = await this.participants.linkThread(threadId, known, tx);
			return { ...projected, links };
		});

		await this.touch(
			{ companyId: match2.companyId, contactId: match2.contactId },
			occurredAt.at,
			threadId,
		);
		await this.participants.settle(occurredAt.links);
		await this.linkNewContact(match2.contactId, startedAt, known);

		await this.agent.threadStored(threadId, "Thread adopted into the CRM");

		return true;
	}

	private async linkNewContact(
		contactId: string | null,
		since: Date,
		context: MatchContext,
	): Promise<void> {
		if (!contactId) return;

		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: { email: true, createdAt: true },
		});
		if (!contact?.email || contact.createdAt < since) return;

		await this.participants.linkContact(contactId, contact.email, context);
	}

	private async visible(
		contactId: string,
		context: MatchContext,
		sentAt: Date,
	): Promise<boolean> {
		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: { email: true, archivedAt: true },
		});
		if (!contact?.archivedAt) return true;
		if (!contact.email) return false;

		return this.match.reviveContact(
			{ email: contact.email, name: null },
			context,
			{ lane: null, sentAt },
		);
	}

	private async contactWithoutCompany(
		person: Participant,
		ownerId: string,
		context: MatchContext,
	): Promise<string | null> {
		const email = person.email.toLowerCase();
		const existing = await this.db.contact.findUnique({
			where: { email },
			select: { id: true },
		});
		if (existing) return existing.id;

		const { firstName, lastName } = splitName(person.name, email);
		let created: { id: string };
		try {
			created = await this.db.contact.create({
				data: {
					firstName,
					lastName,
					email,
					ownerId,
					source: RecordSource.EMAIL,
				},
				select: { id: true },
			});
		} catch (error) {
			if (!contactLimitError.safeParse(error).success) throw error;
			this.logger.warn({
				message: "The contact limit is reached. The thread stays pending",
			});
			return null;
		}

		await this.agent.contactCreated(created.id, "Emailed about your business");
		await this.participants.linkContact(created.id, email, context);

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
		context: MatchContext,
	): Promise<boolean> {
		const found = await this.db.emailMessage.findFirst({
			where: {
				thread: { rootMessageId },
				OR: [
					{ direction: EmailDirection.OUTBOUND },
					{ fromEmail: { in: [...context.ourAddresses] } },
				],
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
