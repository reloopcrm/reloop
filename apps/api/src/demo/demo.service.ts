import { canLoadSampleData, workspaceRoleOf } from "@crm/auth";
import { type Db, Prisma } from "@crm/db";
import type { Locale } from "@crm/db/locale";
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import { DEMO_DATA } from "./demo.config";
import type { SampleDataResult, SampleDataStatus } from "./demo.contracts";
import {
	demoCounts,
	hasDemoData,
	hasRealData,
	removeDemoData,
	seedDemoData,
} from "./demo-data";

const lockAnswer = z
	.array(z.object({ locked: z.boolean() }))
	.min(1)
	.transform((rows) => rows[0]?.locked ?? false);

type Actor = { id: string; name: string; email: string };

@Injectable()
export class DemoService {
	private readonly logger = new Logger(DemoService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async status(userId: string): Promise<SampleDataStatus> {
		const [present, canManage] = await Promise.all([
			hasDemoData(this.db),
			this.mayManage(userId),
		]);

		return {
			present,
			canManage,
			loadable: canManage && !present && !(await this.hasOwnData()),
		};
	}

	async load(actor: Actor, locale: Locale): Promise<SampleDataResult> {
		if (!(await this.mayManage(actor.id))) {
			throw new ForbiddenException("Only an owner loads the sample data.");
		}

		const counts = await this.db.$transaction(
			async (tx) => {
				await this.takeLock(tx);

				if (await hasDemoData(tx)) {
					throw new ConflictException("The sample data is already loaded.");
				}
				if (await hasRealData(tx)) {
					throw new ConflictException(
						"This CRM already holds your own records. The sample data only loads into an empty CRM.",
					);
				}
				if (await this.hasMailbox(tx)) {
					throw new ConflictException(
						"A mailbox is connected, so real records arrive here. The sample data only loads into an empty CRM.",
					);
				}

				return seedDemoData(this.db, tx, actor, locale);
			},
			{
				timeout: DEMO_DATA.write.timeoutMs,
				maxWait: DEMO_DATA.write.maxWaitMs,
			},
		);

		this.logger.log({ message: "Loaded the sample data", locale, counts });

		return { present: true, rows: rowsIn(counts) };
	}

	async remove(userId: string): Promise<SampleDataResult> {
		if (!(await this.mayManage(userId))) {
			throw new ForbiddenException("Only an owner removes the sample data.");
		}

		const removed = await this.db.$transaction(
			async (tx) => {
				await this.takeLock(tx);
				return removeDemoData(tx);
			},
			{
				timeout: DEMO_DATA.write.timeoutMs,
				maxWait: DEMO_DATA.write.maxWaitMs,
			},
		);

		this.logger.log({ message: "Removed the sample data", removed });

		return { present: false, rows: rowsIn(removed) };
	}

	async counts(): Promise<Record<string, number>> {
		return demoCounts(this.db);
	}

	private async mayManage(userId: string): Promise<boolean> {
		return canLoadSampleData(await workspaceRoleOf(userId));
	}

	private async hasOwnData(): Promise<boolean> {
		return (await hasRealData(this.db)) || (await this.hasMailbox(this.db));
	}

	private async hasMailbox(db: Prisma.TransactionClient): Promise<boolean> {
		const row = await db.mailboxSync.findFirst({
			where: { source: { not: DEMO_DATA.calendarSource } },
			select: { id: true },
		});

		return row !== null;
	}

	private async takeLock(db: Prisma.TransactionClient): Promise<void> {
		const rows = await db.$queryRaw`
			SELECT pg_try_advisory_xact_lock(${DEMO_DATA.lock.key}::bigint) AS locked
		`;

		if (!lockAnswer.parse(rows)) {
			throw new ConflictException("The sample data is being written already.");
		}
	}
}

function rowsIn(counts: Record<string, number>): number {
	return Object.values(counts).reduce((total, count) => total + count, 0);
}
