import type { Db } from "@crm/db";
import { threadWorthAdopting } from "@crm/db/contact-worth";
import { THREAD_CLASSIFICATION } from "@crm/db/insights";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ADOPTION } from "./mailbox.config";
import { ThreadWriterService } from "./thread-writer.service";

@Injectable()
export class ThreadAdoptionService {
	private readonly logger = new Logger(ThreadAdoptionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly threads: ThreadWriterService,
	) {}

	async adoptRelevant(): Promise<number> {
		const waiting = await this.db.emailThread.findMany({
			where: {
				classification: THREAD_CLASSIFICATION.relevant,
				contactId: null,
				companyId: null,
			},
			select: {
				id: true,
				insight: {
					select: {
						relevant: true,
						outcome: true,
						quantityPallets: true,
						unansweredByUs: true,
						products: true,
						topics: true,
					},
				},
			},
			orderBy: { lastMessageAt: "desc" },
			take: ADOPTION.batch,
		});

		if (waiting.length === 0) return 0;

		const rules = await readWinBackRules(this.db);
		const context = await this.threads.context();
		let adopted = 0;

		for (const thread of waiting) {
			if (
				!threadWorthAdopting(
					thread.insight,
					{
						minPallets: rules.business.minPallets,
						minBoxes: rules.business.minBoxes,
						boxProducts: rules.business.boxProducts,
					},
					rules.business.products,
				)
			) {
				continue;
			}

			try {
				if (await this.threads.adopt(thread.id, context)) adopted += 1;
			} catch (error) {
				this.logger.error(
					{
						message: "A relevant thread could not be adopted",
						threadId: thread.id,
					},
					error instanceof Error ? error.stack : String(error),
				);
			}
		}

		if (adopted > 0) {
			this.logger.log({ message: "Relevant threads adopted", adopted });
		}

		return adopted;
	}
}
