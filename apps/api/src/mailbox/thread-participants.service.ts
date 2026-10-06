import { type Db, EmailDirection, type Prisma, Prisma as Sql } from "@crm/db";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import type { ThreadContactRole } from "@crm/db/thread-participants";
import { Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import {
	NO_DEADLINE,
	pastDeadline,
	THREAD_PARTICIPANTS,
} from "./mailbox.config";
import {
	MailboxMatchService,
	type MatchContext,
} from "./mailbox-match.service";
import { groupByThread, readThreadMessages } from "./thread-messages";
import { planParticipants } from "./thread-participants";

type Client = Db | Prisma.TransactionClient;

type LinkRow = {
	threadId: string;
	contactId: string;
	role: ThreadContactRole;
	firstAt: Date;
	lastAt: Date;
	archived: boolean;
};

export type ThreadLinkPlan = {
	threadId: string;
	ownContactId: string | null;
	rows: LinkRow[];
	changed: LinkRow[];
	stale: string[];
	slot: { contactId: string; activityAt: Date } | null;
};

export type LinkOutcome = {
	threads: number;
	linked: number;
	written: number;
	removed: number;
	slots: number;
	contacts: Set<string>;
	stamps: { contactId: string; at: Date }[];
	touches: { contactId: string; at: Date }[];
};

export type BackfillOptions = {
	from: string | null;
	dryRun: boolean;
	deadlineAt?: number;
	batch?: number;
};

export type BackfillResult = LinkOutcome & {
	lastId: string | null;
	done: boolean;
};

function emptyOutcome(): LinkOutcome {
	return {
		threads: 0,
		linked: 0,
		written: 0,
		removed: 0,
		slots: 0,
		contacts: new Set(),
		stamps: [],
		touches: [],
	};
}

function notInFuture(at: Date): Date {
	return new Date(Math.min(at.getTime(), Date.now()));
}

@Injectable()
export class ThreadParticipantsService {
	private readonly logger = new Logger(ThreadParticipantsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly stamp: ActivityStampService,
		private readonly agent: AgentTriggerService,
	) {}

	async context(mailbox?: string): Promise<MatchContext> {
		const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
			this.match.internalIdentity(),
			this.match.suppressedDomains(),
			this.match.suppressedEmails(),
		]);

		if (mailbox) internal.addresses.add(mailbox.toLowerCase());

		return {
			ourAddresses: internal.addresses,
			ourDomains: internal.domains,
			suppressedDomains,
			suppressedEmails,
		};
	}

	async plan(
		threadIds: readonly string[],
		context: MatchContext,
		client: Client = this.db,
	): Promise<ThreadLinkPlan[]> {
		if (threadIds.length === 0) return [];

		const [threads, messages, existing] = await Promise.all([
			client.emailThread.findMany({
				where: { id: { in: [...threadIds] } },
				select: {
					id: true,
					subject: true,
					contactId: true,
					companyId: true,
					activity: { select: { createdAt: true } },
				},
			}),
			readThreadMessages(client, threadIds),
			client.emailThreadContact.findMany({
				where: { threadId: { in: [...threadIds] } },
				select: {
					threadId: true,
					contactId: true,
					role: true,
					firstAt: true,
					lastAt: true,
				},
			}),
		]);
		const byThread = groupByThread(messages);
		const participations = new Map(
			threads.map((thread) => [
				thread.id,
				planParticipants(
					byThread.get(thread.id) ?? [],
					thread.subject,
					context,
				),
			]),
		);

		const emails = new Set<string>();
		for (const list of participations.values()) {
			for (const person of list) emails.add(person.email);
		}
		const contacts =
			emails.size === 0
				? []
				: await client.contact.findMany({
						where: { email: { in: [...emails] } },
						select: {
							id: true,
							email: true,
							companyId: true,
							archivedAt: true,
						},
					});
		const byEmail = new Map<string, typeof contacts>();
		for (const contact of contacts) {
			const email = contact.email?.toLowerCase();
			if (!email) continue;
			const list = byEmail.get(email) ?? [];
			list.push(contact);
			byEmail.set(email, list);
		}
		const links = groupByThread(existing);

		return threads.map((thread) => {
			const rows: LinkRow[] = [];
			const companies = new Map<string, string | null>();
			for (const person of participations.get(thread.id) ?? []) {
				for (const contact of byEmail.get(person.email) ?? []) {
					rows.push({
						threadId: thread.id,
						contactId: contact.id,
						role: person.role,
						firstAt: person.firstAt,
						lastAt: person.lastAt,
						archived: contact.archivedAt !== null,
					});
					companies.set(contact.id, contact.companyId);
				}
			}

			const current = new Map(
				(links.get(thread.id) ?? []).map((link) => [link.contactId, link]),
			);
			const wanted = new Set(rows.map((row) => row.contactId));
			const changed = rows.filter((row) => {
				const link = current.get(row.contactId);
				return (
					!link ||
					link.role !== row.role ||
					link.firstAt.getTime() !== row.firstAt.getTime() ||
					link.lastAt.getTime() !== row.lastAt.getTime()
				);
			});
			const stale = [...current.keys()].filter((id) => !wanted.has(id));

			let slot: ThreadLinkPlan["slot"] = null;
			if (thread.contactId === null && thread.activity) {
				const candidate = rows.find(
					(row) =>
						!row.archived &&
						(thread.companyId === null ||
							companies.get(row.contactId) === thread.companyId),
				);
				if (candidate) {
					slot = {
						contactId: candidate.contactId,
						activityAt: thread.activity.createdAt,
					};
				}
			}

			return {
				threadId: thread.id,
				ownContactId: thread.contactId,
				rows,
				changed,
				stale,
				slot,
			};
		});
	}

	async apply(
		plans: readonly ThreadLinkPlan[],
		client: Client = this.db,
	): Promise<LinkOutcome> {
		const outcome = emptyOutcome();
		const changed = plans.flatMap((plan) => plan.changed);
		const stale = plans.flatMap((plan) =>
			plan.stale.map((contactId) => ({ threadId: plan.threadId, contactId })),
		);

		for (const rows of chunks(changed, THREAD_PARTICIPANTS.insertChunk)) {
			await client.$executeRaw`
				INSERT INTO "emailThreadContact" ("threadId", "contactId", "role", "firstAt", "lastAt", "updatedAt")
				VALUES ${Sql.join(
					rows.map(
						(row) =>
							Sql.sql`(${row.threadId}, ${row.contactId}, ${row.role}, ${row.firstAt}, ${row.lastAt}, now())`,
					),
				)}
				ON CONFLICT ("threadId", "contactId") DO UPDATE
				SET "role" = EXCLUDED."role",
					"firstAt" = EXCLUDED."firstAt",
					"lastAt" = EXCLUDED."lastAt",
					"updatedAt" = now()`;
			outcome.written += rows.length;
		}

		for (const pairs of chunks(stale, THREAD_PARTICIPANTS.insertChunk)) {
			outcome.removed += await client.$executeRaw`
				DELETE FROM "emailThreadContact"
				WHERE ("threadId", "contactId") IN (${Sql.join(
					pairs.map((pair) => Sql.sql`(${pair.threadId}, ${pair.contactId})`),
				)})`;
		}

		for (const plan of plans) {
			outcome.threads += 1;
			outcome.linked += plan.rows.length;

			let ownContactId = plan.ownContactId;
			if (plan.slot) {
				const { count } = await client.emailThread.updateMany({
					where: { id: plan.threadId, contactId: null },
					data: { contactId: plan.slot.contactId },
				});
				if (count > 0) {
					await client.activity.updateMany({
						where: { emailThreadId: plan.threadId, contactId: null },
						data: { contactId: plan.slot.contactId },
					});
					outcome.slots += 1;
					ownContactId = plan.slot.contactId;
					outcome.touches.push({
						contactId: plan.slot.contactId,
						at: plan.slot.activityAt,
					});
				}
			}

			for (const row of plan.rows) {
				outcome.contacts.add(row.contactId);
				if (row.archived || row.contactId === ownContactId) continue;
				outcome.stamps.push({
					contactId: row.contactId,
					at: notInFuture(row.lastAt),
				});
			}
		}

		return outcome;
	}

	async linkThread(
		threadId: string,
		context: MatchContext,
		client: Client = this.db,
	): Promise<LinkOutcome> {
		return this.apply(await this.plan([threadId], context, client), client);
	}

	async linkThreads(
		threadIds: readonly string[],
		context: MatchContext,
		client: Client = this.db,
	): Promise<LinkOutcome> {
		return this.apply(await this.plan(threadIds, context, client), client);
	}

	async settle(outcome: LinkOutcome): Promise<void> {
		try {
			for (const stamp of outcome.stamps) {
				await this.stamp.stampThreadMail(stamp.contactId, stamp.at);
			}
			for (const touch of outcome.touches) {
				await this.stamp.touch({ contactId: touch.contactId }, touch.at);
			}
		} catch (error) {
			this.logger.error(
				{
					message:
						"Mail was linked to its contacts but their activity stamps were not moved",
					stamps: outcome.stamps.length,
				},
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	async linkContact(
		contactId: string,
		email: string,
		context: MatchContext,
	): Promise<number> {
		const address = email.trim().toLowerCase();
		if (!address) return 0;

		try {
			const touched = await this.db.emailMessage.findMany({
				where: {
					OR: [
						{ direction: EmailDirection.INBOUND, fromEmail: address },
						{
							direction: EmailDirection.OUTBOUND,
							recipients: { array_contains: [{ email: address }] },
						},
					],
				},
				select: { threadId: true },
				distinct: ["threadId"],
			});
			const threadIds = touched.map((row) => row.threadId);
			let linked = 0;

			for (
				let start = 0;
				start < threadIds.length;
				start += THREAD_PARTICIPANTS.contactBatch
			) {
				const batch = threadIds.slice(
					start,
					start + THREAD_PARTICIPANTS.contactBatch,
				);
				const outcome = await this.db.$transaction(
					(tx) => this.linkThreads(batch, context, tx),
					{ timeout: THREAD_PARTICIPANTS.transactionTimeoutMs },
				);
				await this.settle(outcome);
				linked += outcome.threads;
			}

			await this.requestMemory(contactId);

			return linked;
		} catch (error) {
			this.logger.error(
				{ message: "The mail of a contact was not linked", contactId },
				error instanceof Error ? error.stack : String(error),
			);
			return 0;
		}
	}

	private async requestMemory(contactId: string): Promise<void> {
		const contact = await this.db.contact.findFirst({
			where: { id: contactId, archivedAt: null, memory: null },
			select: {
				threadLinks: {
					where: { thread: { insight: { relevant: true } } },
					orderBy: { lastAt: "desc" },
					take: 1,
					select: { threadId: true },
				},
			},
		});
		const link = contact?.threadLinks[0];
		if (!link) return;

		await this.agent.contactMemoryRequested(link.threadId);
	}

	async relinkContact(
		contactId: string,
		email: string | null,
		context: MatchContext,
	): Promise<number> {
		await this.db.emailThreadContact.deleteMany({ where: { contactId } });
		if (!email) return 0;
		return this.linkContact(contactId, email, context);
	}

	async backfill(options: BackfillOptions): Promise<BackfillResult> {
		const context = await this.context();
		const batch = options.batch ?? THREAD_PARTICIPANTS.backfillBatch;
		const deadlineAt = options.deadlineAt ?? NO_DEADLINE;
		const result: BackfillResult = {
			...emptyOutcome(),
			lastId: options.from,
			done: false,
		};

		for (;;) {
			const threads = await this.db.emailThread.findMany({
				where: {
					id: {
						not: { startsWith: SAMPLE_DATA.prefix },
						gt: result.lastId ?? undefined,
					},
				},
				orderBy: { id: "asc" },
				take: batch,
				select: { id: true },
			});
			if (threads.length === 0) {
				result.done = true;
				return result;
			}

			const ids = threads.map((thread) => thread.id);
			const outcome = options.dryRun
				? await this.preview(await this.plan(ids, context))
				: await this.db.$transaction(
						(tx) => this.linkThreads(ids, context, tx),
						{ timeout: THREAD_PARTICIPANTS.transactionTimeoutMs },
					);
			if (!options.dryRun) await this.settle(outcome);
			merge(result, outcome);
			result.lastId = ids[ids.length - 1] ?? result.lastId;

			if (threads.length < batch) {
				result.done = true;
				return result;
			}
			if (pastDeadline(deadlineAt)) return result;
		}
	}

	private preview(plans: readonly ThreadLinkPlan[]): LinkOutcome {
		const outcome = emptyOutcome();
		for (const plan of plans) {
			outcome.threads += 1;
			outcome.linked += plan.rows.length;
			outcome.written += plan.changed.length;
			outcome.removed += plan.stale.length;
			if (plan.slot) outcome.slots += 1;
			for (const row of plan.rows) outcome.contacts.add(row.contactId);
		}
		return outcome;
	}
}

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
	const parts: Item[][] = [];
	for (let start = 0; start < items.length; start += size) {
		parts.push(items.slice(start, start + size));
	}
	return parts;
}

function merge(into: LinkOutcome, from: LinkOutcome): void {
	into.threads += from.threads;
	into.linked += from.linked;
	into.written += from.written;
	into.removed += from.removed;
	into.slots += from.slots;
	for (const id of from.contacts) into.contacts.add(id);
}
