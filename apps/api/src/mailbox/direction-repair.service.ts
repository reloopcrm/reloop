import { type Db, EmailDirection } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { Injectable, Logger } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { DIRECTION, THREAD_PARTICIPANTS } from "./mailbox.config";
import { MailboxMatchService } from "./mailbox-match.service";
import { ThreadParticipantsService } from "./thread-participants.service";

@Injectable()
export class DirectionRepairService {
	private readonly logger = new Logger(DirectionRepairService.name);
	private readonly settled = new Set<string>();

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
		private readonly agent: AgentTriggerService,
		private readonly participants: ThreadParticipantsService,
	) {}

	async repair(): Promise<number> {
		const identity = await this.match.internalIdentity();
		const addresses = [...identity.addresses].sort();
		const domains = [...identity.domains].sort();
		if (addresses.length === 0 && domains.length === 0) return 0;

		const key = [cloud.scopeId() ?? "", ...addresses, "|", ...domains].join(
			"\n",
		);
		if (this.settled.has(key)) return 0;

		const wrong = await this.db.emailMessage.findMany({
			where: {
				direction: EmailDirection.INBOUND,
				OR: [
					{ fromEmail: { in: addresses } },
					...domains.map((domain) => ({
						fromEmail: { endsWith: `@${domain}` },
					})),
				],
			},
			select: { id: true, threadId: true, fromEmail: true },
			take: DIRECTION.repairBatch,
		});

		if (wrong.length < DIRECTION.repairBatch) this.settled.add(key);
		if (wrong.length === 0) return 0;

		const { count } = await this.db.emailMessage.updateMany({
			where: {
				id: { in: wrong.map((message) => message.id) },
				direction: EmailDirection.INBOUND,
			},
			data: { direction: EmailDirection.OUTBOUND },
		});

		const threadIds = [...new Set(wrong.map((message) => message.threadId))];
		const context = await this.participants.context();
		for (
			let start = 0;
			start < threadIds.length;
			start += THREAD_PARTICIPANTS.repairBatch
		) {
			const batch = threadIds.slice(
				start,
				start + THREAD_PARTICIPANTS.repairBatch,
			);
			await this.participants.settle(
				await this.participants.linkThreads(batch, context),
			);
		}

		const stale = await this.db.threadInsight.findMany({
			where: { threadId: { in: threadIds } },
			select: { threadId: true },
		});
		for (const { threadId } of stale) {
			await this.agent.threadStored(
				threadId,
				"Mail from our own address was filed as received",
				"backfill",
				{ reread: true },
			);
		}

		this.logger.log({
			message: "Mail from our own addresses was marked as sent by us",
			count,
			senderDomains: new Set(
				wrong.map((message) =>
					message.fromEmail
						.slice(message.fromEmail.lastIndexOf("@") + 1)
						.toLowerCase(),
				),
			).size,
			reread: stale.length,
		});

		return count;
	}
}
