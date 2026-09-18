import type { Db, Prisma } from "@crm/db";
import type { QuantityRule, ThreadSignal } from "@crm/db/contact-worth";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import {
	QUOTE_DEAL_STAGE,
	QUOTE_DEALS,
	QUOTE_OUTCOMES,
	quoteThreadCutoff,
	quoteWorthDeal,
} from "@crm/db/quote-deals";
import { NOT_SAMPLE_RECORD } from "@crm/db/sample-data";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";
import type { QuoteListOutput } from "./quotes.contracts";

const THREAD_SELECT = {
	id: true,
	subject: true,
	companyId: true,
	lastMessageAt: true,
	company: { select: { id: true, name: true } },
	contact: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			imageUrl: true,
			companyId: true,
			archivedAt: true,
		},
	},
	insight: {
		select: {
			relevant: true,
			outcome: true,
			quantityPallets: true,
			unansweredByUs: true,
			products: true,
			topics: true,
			summary: true,
		},
	},
} satisfies Prisma.EmailThreadSelect;

type QuoteThread = Prisma.EmailThreadGetPayload<{
	select: typeof THREAD_SELECT;
}>;

@Injectable()
export class QuotesService {
	private readonly logger = new Logger(QuotesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly deals: DealsService,
	) {}

	private waiting(now: Date, rule: QuantityRule): Prisma.EmailThreadWhereInput {
		return {
			...NOT_SAMPLE_RECORD,
			quoteHandledAt: null,
			lastMessageAt: { gte: quoteThreadCutoff(now) },
			insight: {
				is: {
					relevant: true,
					outcome: { in: [...QUOTE_OUTCOMES] },
					quantityPallets: { gte: floorOf(rule) },
				},
			},
			company: {
				is: {
					archivedAt: null,
					deals: {
						none: { archivedAt: null, stage: { in: [...OPEN_DEAL_STAGES] } },
					},
				},
			},
		};
	}

	async list(): Promise<QuoteListOutput> {
		const rules = await readWinBackRules(this.db);
		const rule = rules.business;

		const threads = await this.db.emailThread.findMany({
			where: this.waiting(new Date(), rule),
			orderBy: { lastMessageAt: "desc" },
			take: QUOTE_DEALS.scan.maxRows,
			select: THREAD_SELECT,
		});

		const rows: QuoteListOutput["rows"] = [];
		const seen = new Set<string>();
		let truncated = false;

		for (const thread of threads) {
			if (!worthy(thread, rule)) continue;
			const company = thread.company;
			if (!company || seen.has(company.id)) continue;

			if (rows.length >= QUOTE_DEALS.list.max) {
				truncated = true;
				break;
			}

			seen.add(company.id);
			rows.push(rowOf(thread, company));
		}

		return {
			rows,
			truncated: truncated || threads.length === QUOTE_DEALS.scan.maxRows,
			stage: QUOTE_DEAL_STAGE,
			unit: rule.unit,
		};
	}

	async create(userId: string, threadId: string) {
		const now = new Date();
		const rules = await readWinBackRules(this.db);
		const rule = rules.business;

		const thread = await this.db.emailThread.findFirst({
			where: { id: threadId, ...this.waiting(now, rule) },
			select: THREAD_SELECT,
		});

		if (!thread || !thread.company || !worthy(thread, rule)) {
			throw new NotFoundException("That quote is no longer waiting.");
		}

		const claimed = await this.db.emailThread.updateMany({
			where: { id: threadId, quoteHandledAt: null },
			data: { quoteHandledAt: now },
		});

		if (claimed.count === 0) {
			throw new NotFoundException("That quote is no longer waiting.");
		}

		const company = thread.company;

		try {
			const deal = await this.deals.create({
				name: thread.subject?.trim() || company.name,
				companyId: company.id,
				ownerId: userId,
				stage: QUOTE_DEAL_STAGE,
			});

			const contact = attachable(thread);
			if (contact) {
				await this.deals.attachContact({
					dealId: deal.id,
					contactId: contact.id,
				});
			}

			this.logger.log({
				message: "Deal created from a quote in the mail",
				dealId: deal.id,
				threadId,
			});

			return {
				threadId,
				dealId: deal.id,
				contactId: contact?.id ?? null,
			};
		} catch (error) {
			await this.db.emailThread.update({
				where: { id: threadId },
				data: { quoteHandledAt: null },
			});
			throw error;
		}
	}

	async dismiss(threadId: string) {
		const { count } = await this.db.emailThread.updateMany({
			where: { id: threadId, quoteHandledAt: null },
			data: { quoteHandledAt: new Date() },
		});

		if (count === 0) {
			throw new NotFoundException("That quote is no longer waiting.");
		}

		this.logger.log({ message: "Quote dismissed", threadId });

		return { threadId };
	}
}

function floorOf(rule: QuantityRule): number {
	const boxes = rule.minBoxes;
	return boxes === undefined
		? rule.minPallets
		: Math.min(rule.minPallets, boxes);
}

function signalOf(thread: QuoteThread): ThreadSignal | null {
	const insight = thread.insight;
	if (!insight) return null;

	return {
		relevant: insight.relevant,
		outcome: insight.outcome,
		quantityPallets: insight.quantityPallets,
		unansweredByUs: insight.unansweredByUs,
		products: insight.products,
		topics: insight.topics,
	};
}

function worthy(thread: QuoteThread, rule: QuantityRule): boolean {
	const signal = signalOf(thread);
	return signal !== null && quoteWorthDeal(signal, rule);
}

function attachable(thread: QuoteThread) {
	const contact = thread.contact;
	if (!contact || contact.archivedAt !== null) return null;
	return contact.companyId === thread.companyId ? contact : null;
}

function rowOf(
	thread: QuoteThread,
	company: { id: string; name: string },
): QuoteListOutput["rows"][number] {
	const contact = attachable(thread);

	return {
		threadId: thread.id,
		subject: thread.subject,
		summary: thread.insight?.summary ?? "",
		lastMessageAt: thread.lastMessageAt.toISOString(),
		quantityPallets: thread.insight?.quantityPallets ?? null,
		products: thread.insight?.products ?? [],
		company,
		contact: contact
			? {
					id: contact.id,
					firstName: contact.firstName,
					lastName: contact.lastName,
					email: contact.email,
					imageUrl: contact.imageUrl,
				}
			: null,
	};
}
