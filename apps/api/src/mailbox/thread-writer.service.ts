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
import {
	isAutoReply,
	isRealAnswer,
	isReplySubject,
} from "@crm/db/message-text";
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
import {
	externalParticipants,
	isOwnAddress,
	type Participant,
	splitName,
	workDomain,
} from "./participants";
import { outreachReply, type ReplySkip } from "./reply-adoption";
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

export type ReplyAdoption =
	| { status: "adopted"; created: boolean }
	| { status: "skipped"; reason: ReplySkip }
	| { status: "limited" };

type Placement = { companyId: string | null; contactId: string | null };

type PlacedThread = {
	id: string;
	subject: string | null;
	snippet: string | null;
	lastMessageAt: Date;
};

type PlacementTask = {
	reason: string;
	lane?: AgentTaskOrigin;
	reread?: boolean;
	at?: Date;
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
			const byPolicy =
				row.autoCreate && (repliedTo || (row.createWithoutReply && !auto));
			const direct =
				relevantOnly &&
				!byPolicy &&
				!repliedTo &&
				options.lane === "forward" &&
				answersOutreach(parsed, context);

			const match = await this.match.resolve(
				{
					participants: direct ? [parsed.from] : participants,
					allowCreate: byPolicy || direct,
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
					const content = {
						direction: outbound
							? EmailDirection.OUTBOUND
							: EmailDirection.INBOUND,
						fromEmail: parsed.from.email,
						subject: parsed.subject,
						snippet: snippetOf(parsed.body),
						body: parsed.body || null,
					};
					await tx.emailMessage.create({
						data: {
							threadId: record.id,
							rfcMessageId: parsed.rfcMessageId,
							syncedByUserId: row.userId,
							gmailMessageId: parsed.gmailMessageId ?? null,
							outlookMessageId: parsed.outlookMessageId ?? null,
							outlookWebLink: parsed.outlookWebLink ?? null,
							imapAccountId: parsed.imapAccountId ?? null,
							...content,
							fromName: parsed.from.name,
							recipients: parsed.recipients,
							sentAt: parsed.sentAt,
							realAnswer: isRealAnswer(content),
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
			if (await this.storedElsewhere(error, parsed.rfcMessageId, repair)) {
				return false;
			}
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

		await this.place(
			{
				id: threadId,
				subject: thread.subject,
				snippet: thread.messages.at(-1)?.snippet ?? null,
				lastMessageAt: thread.lastMessageAt,
			},
			placed,
			ownerId,
			known,
			startedAt,
			{ reason: "Thread adopted into the CRM" },
		);

		return true;
	}

	async adoptReply(
		threadId: string,
		context: MatchContext,
		owners: ReadonlySet<string>,
	): Promise<ReplyAdoption> {
		const thread = await this.db.emailThread.findUnique({
			where: { id: threadId },
			select: {
				id: true,
				rootMessageId: true,
				subject: true,
				contactId: true,
				companyId: true,
				lastMessageAt: true,
				company: { select: { domain: true, archivedAt: true } },
				messages: {
					orderBy: { sentAt: "asc" },
					select: {
						rfcMessageId: true,
						direction: true,
						subject: true,
						body: true,
						fromEmail: true,
						fromName: true,
						recipients: true,
						snippet: true,
						syncedByUserId: true,
						sentAt: true,
					},
				},
			},
		});
		if (!thread || thread.contactId) {
			return { status: "skipped", reason: "linked" };
		}

		const found = outreachReply(
			{
				rootMessageId: thread.rootMessageId,
				messages: thread.messages.map((message) => ({
					...message,
					subject: message.subject ?? thread.subject,
					recipients: recipientsOf(message.recipients).map(
						(person) => person.email,
					),
				})),
			},
			context,
		);
		if (!found.reply) return { status: "skipped", reason: found.skip };

		const reply = found.reply;
		const ownerId = reply.syncedByUserId;
		if (!ownerId || !owners.has(ownerId)) {
			return { status: "skipped", reason: "policy-off" };
		}

		const sender: Participant = {
			email: reply.fromEmail.trim().toLowerCase(),
			name: reply.fromName,
		};
		if (externalParticipants([sender], context).length === 0) {
			return { status: "skipped", reason: "sender-filtered" };
		}

		const startedAt = new Date();
		const at = new Date(Math.min(reply.sentAt.getTime(), startedAt.getTime()));
		const before = await this.db.contact.findUnique({
			where: { email: sender.email },
			select: { id: true },
		});
		const request = { source: RecordSource.EMAIL, ownerId };
		let placed: Placement;

		if (thread.companyId) {
			if (thread.company?.archivedAt) {
				return { status: "skipped", reason: "archived-company" };
			}
			if (
				!thread.company?.domain ||
				workDomain(sender.email) !== thread.company.domain
			) {
				return { status: "skipped", reason: "other-domain" };
			}

			const added = await this.match.addCompanyContact(
				sender,
				thread.companyId,
				request,
				at,
			);
			if (added.limited || !added.contactId) return { status: "limited" };

			placed = { companyId: thread.companyId, contactId: added.contactId };
		} else {
			const match = await this.match.resolve(
				{
					...request,
					participants: [sender],
					allowCreate: true,
					lastMailAt: at,
				},
				context,
			);
			if (match.limited) return { status: "limited" };

			const contactId =
				match.contactId ??
				(await this.contactWithoutCompany(sender, ownerId, context));
			if (!contactId) return { status: "limited" };

			placed = { companyId: match.companyId, contactId };
		}

		if (
			placed.contactId &&
			!(await this.visible(placed.contactId, context, thread.lastMessageAt))
		) {
			return { status: "skipped", reason: "archived-contact" };
		}

		await this.place(
			{
				id: threadId,
				subject: thread.subject,
				snippet: thread.messages.at(-1)?.snippet ?? null,
				lastMessageAt: thread.lastMessageAt,
			},
			placed,
			ownerId,
			context,
			startedAt,
			{
				reason: "A reply to our own mail was filed",
				lane: "backfill",
				reread: true,
				at,
			},
		);

		return { status: "adopted", created: before === null };
	}

	private async place(
		thread: PlacedThread,
		placed: Placement,
		ownerId: string,
		context: MatchContext,
		startedAt: Date,
		task: PlacementTask,
	): Promise<void> {
		const occurredAt = await this.db.$transaction(async (tx) => {
			await tx.emailThread.update({
				where: { id: thread.id },
				data: { companyId: placed.companyId, contactId: placed.contactId },
			});

			const projected = await this.project(tx, thread.id, ownerId, {
				subject: thread.subject ?? "(no subject)",
				snippet: thread.snippet,
				lastMessageAt: thread.lastMessageAt,
				companyId: placed.companyId,
				contactId: placed.contactId,
				origin: "imap",
				at: task.at,
			});
			if (placed.contactId) {
				await tx.activity.updateMany({
					where: { emailThreadId: thread.id, contactId: null },
					data: { contactId: placed.contactId },
				});
			}
			const links = await this.participants.linkThread(thread.id, context, tx);
			return { ...projected, links };
		});

		await this.touch(placed, occurredAt.at, thread.id);
		await this.participants.settle(occurredAt.links);
		await this.linkNewContact(placed.contactId, startedAt, context);

		await this.agent.threadStored(thread.id, task.reason, task.lane, {
			reread: task.reread,
		});
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
		repair: boolean,
	): Promise<boolean> {
		const duplicate =
			cause instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			cause.code === "P2002";
		if (!duplicate) return false;

		const winner = await this.db.emailMessage.findFirst({
			where: repair
				? { rfcMessageId, thread: { activity: { isNot: null } } }
				: { rfcMessageId },
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
			at?: Date;
		},
	): Promise<{ id: string; at: Date }> {
		const activity = await tx.activity.upsert({
			where: { emailThreadId },
			create: {
				type: ActivityType.EMAIL,
				subject: summary.subject,
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
				createdAt: summary.at,
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

function answersOutreach(
	parsed: IncomingMessage,
	context: MatchContext,
): boolean {
	const found = outreachReply(
		{
			rootMessageId: parsed.rootId,
			messages: [
				{
					rfcMessageId: parsed.rfcMessageId,
					direction: "INBOUND" as const,
					fromEmail: parsed.from.email,
					subject: parsed.subject,
					body: parsed.body,
					snippet: null,
					recipients: parsed.recipients.map((person) => person.email),
				},
			],
		},
		context,
	);

	return found.reply !== null;
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
