import type { Db } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import { fillRealAnswers, realAnswersMissing } from "@crm/db/real-answer";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { REAL_ANSWER } from "./mailbox.config";

@Injectable()
export class RealAnswerBackfillService {
	private readonly logger = new Logger(RealAnswerBackfillService.name);
	private readonly settled = new Set<string>();

	constructor(@InjectDatabase() private readonly db: Db) {}

	async backfill(): Promise<number> {
		const key = cloud.scopeId() ?? "";
		if (this.settled.has(key)) return 0;

		const count = await fillRealAnswers(this.db, REAL_ANSWER.backfillBatch);
		if (
			count < REAL_ANSWER.backfillBatch &&
			!(await realAnswersMissing(this.db))
		) {
			this.settled.add(key);
		}
		if (count > 0) {
			this.logger.log({
				message: "Stored mail was marked as a real answer or not",
				count,
			});
		}

		return count;
	}
}
