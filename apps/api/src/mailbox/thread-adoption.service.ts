import type { Db } from "@crm/db";
import { threadWorthAdopting } from "@crm/db/contact-worth";
import { THREAD_CLASSIFICATION } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ADOPTION } from "./mailbox.config";
import {
	readThreadAdoptionCursor,
	serialiseThreadAdoptionCursor,
	type ThreadAdoptionCursor,
} from "./thread-adoption-cursor";
import { ThreadWriterService } from "./thread-writer.service";

type WaitingThread = Awaited<
	ReturnType<ThreadAdoptionService["waitingAfter"]>
>[number];

@Injectable()
export class ThreadAdoptionService {
	private readonly logger = new Logger(ThreadAdoptionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly threads: ThreadWriterService,
	) {}

	async adoptRelevant(): Promise<number> {
		const after = await this.readCursor();
		const head = await this.waitingAfter(null);
		const page = after ? await this.waitingAfter(after) : head;
		const last = page.at(-1);
		const next =
			page.length < ADOPTION.batch || !last
				? null
				: { v: 1 as const, at: last.lastMessageAt.toISOString(), id: last.id };

		const moved =
			serialiseThreadAdoptionCursor(next) !==
			serialiseThreadAdoptionCursor(after);

		const waiting = uniqueThreads([...head, ...page]);
		if (waiting.length === 0) {
			if (moved) await this.writeCursor(next);
			return 0;
		}

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

		if (moved) await this.writeCursor(next);

		if (adopted > 0) {
			this.logger.log({ message: "Relevant threads adopted", adopted });
		}

		return adopted;
	}

	private waitingAfter(after: ThreadAdoptionCursor | null) {
		return this.db.emailThread.findMany({
			where: {
				classification: THREAD_CLASSIFICATION.relevant,
				contactId: null,
				companyId: null,
				...(after && {
					OR: [
						{ lastMessageAt: { lt: new Date(after.at) } },
						{ lastMessageAt: new Date(after.at), id: { lt: after.id } },
					],
				}),
			},
			select: {
				id: true,
				lastMessageAt: true,
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
			orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
			take: ADOPTION.batch,
		});
	}

	private async readCursor(): Promise<ThreadAdoptionCursor | null> {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { threadAdoptionCursor: true },
		});
		const read = readThreadAdoptionCursor(settings?.threadAdoptionCursor);
		if (read.outcome === "ok") return read.cursor;
		if (read.outcome === "unreadable") {
			this.logger.warn({
				message:
					"The thread adoption cursor is unreadable. The pass starts again from the newest thread",
				reason: read.reason,
			});
		}
		return null;
	}

	private async writeCursor(
		cursor: ThreadAdoptionCursor | null,
	): Promise<void> {
		const value = serialiseThreadAdoptionCursor(cursor);
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, threadAdoptionCursor: value },
			update: { threadAdoptionCursor: value },
		});
	}
}

function uniqueThreads(threads: WaitingThread[]): WaitingThread[] {
	return [...new Map(threads.map((thread) => [thread.id, thread])).values()];
}
