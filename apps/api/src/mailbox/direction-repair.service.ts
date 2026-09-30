import { type Db, EmailDirection } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { DIRECTION } from "./mailbox.config";
import { MailboxMatchService } from "./mailbox-match.service";

@Injectable()
export class DirectionRepairService {
	private readonly logger = new Logger(DirectionRepairService.name);
	private readonly settled = new Set<string>();

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly match: MailboxMatchService,
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
			select: { id: true },
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

		this.logger.log({
			message: "Mail from our own addresses was marked as sent by us",
			count,
		});

		return count;
	}
}
