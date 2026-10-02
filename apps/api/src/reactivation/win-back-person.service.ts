import { type Db, DealStage } from "@crm/db";
import type { InsightOutcome } from "@crm/db/insights";
import {
	listReactivationCandidates,
	REACTIVATION,
	readReactivationCandidate,
} from "@crm/db/reactivation";
import {
	isAgentFunctionEnabled,
	readAgentFunctions,
	WIN_BACK_FOLLOW_UP_FUNCTION,
} from "@crm/validation/agent-functions";
import {
	readAgentLanguage,
	summaryIsStale,
	summaryLanguage,
} from "@crm/validation/agent-language";
import {
	keepKnownMessages,
	type PersonStory,
	parsePersonStory,
	storyMessageIds,
} from "@crm/validation/person-story";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { mailboxLinkOf } from "../mailbox/mailbox-link";
import { PERSON_VIEW, WIN_BACK } from "./reactivation.config";
import type { WinBackPersonViewOutput } from "./reactivation.contracts";
import { sortGroups } from "./win-back-groups";

const STORY_KIND = "person-story";

const DEAL_DONE = "DEAL_DONE" satisfies InsightOutcome;

const NO_MAIL = "This person has no mail to win back from.";

const MAIL_SELECT = {
	id: true,
	threadId: true,
	subject: true,
	direction: true,
	fromName: true,
	fromEmail: true,
	sentAt: true,
	body: true,
	summary: true,
	gmailMessageId: true,
	outlookWebLink: true,
} as const;

type StoredStory = {
	story: PersonStory | null;
	stale: boolean;
	writtenAt: string | null;
};

function nameOf(person: { firstName: string; lastName: string | null }) {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

@Injectable()
export class WinBackPersonService {
	private readonly logger = new Logger(WinBackPersonService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async person(contactId: string): Promise<WinBackPersonViewOutput> {
		const rules = await readWinBackRules(this.db);
		const [contact, candidate] = await Promise.all([
			this.db.contact.findUnique({
				where: { id: contactId },
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true,
					imageUrl: true,
					companyId: true,
					company: { select: { id: true, name: true, city: true } },
					memory: { select: { brief: true } },
					story: {
						select: {
							story: true,
							language: true,
							basedOnUntil: true,
							updatedAt: true,
						},
					},
				},
			}),
			readReactivationCandidate(this.db, { contactId, rules }),
		]);

		if (!contact) {
			throw new NotFoundException(`No contact with id ${contactId}.`);
		}
		if (!candidate) throw new NotFoundException(NO_MAIL);

		const where = { thread: { contactId } };
		const [newestMails, mailCount, ticks, orders, insights, newest] =
			await Promise.all([
				this.db.emailMessage.findMany({
					where,
					orderBy: { sentAt: "desc" },
					take: PERSON_VIEW.mails,
					select: MAIL_SELECT,
				}),
				this.db.emailMessage.count({ where }),
				this.db.emailMessage.findMany({
					where,
					orderBy: { sentAt: "desc" },
					take: PERSON_VIEW.timelineMails,
					select: { sentAt: true, subject: true },
				}),
				this.db.deal.findMany({
					where: {
						archivedAt: null,
						stage: DealStage.CLOSED_WON,
						OR: [
							{ contacts: { some: { contactId } } },
							...(contact.companyId ? [{ companyId: contact.companyId }] : []),
						],
					},
					select: { name: true, closedAt: true, stageChangedAt: true },
				}),
				this.db.threadInsight.findMany({
					where: { thread: { contactId } },
					select: {
						threadId: true,
						evidence: true,
						evidenceMessageIds: true,
						unansweredByUs: true,
						outcome: true,
						lastMessageAt: true,
						thread: { select: { subject: true } },
					},
				}),
				this.db.emailThread.aggregate({
					where: { contactId },
					_max: { lastMessageAt: true },
				}),
			]);

		const stored = await this.storedStory(contactId, contact.story);
		const wanted = summaryLanguage(
			await readAgentLanguage(this.db),
			process.env.RELOOP_GERMAN,
		);
		const newestAt = newest._max.lastMessageAt;
		const stale =
			contact.story !== null &&
			(stored.stale ||
				summaryIsStale(contact.story.language, wanted) ||
				(newestAt !== null &&
					(contact.story.basedOnUntil === null ||
						newestAt > contact.story.basedOnUntil)));
		const queued = await this.queueStory(
			contactId,
			contact.story === null || stale,
			newestAt,
		);

		const shown = new Set(newestMails.map((mail) => mail.id));
		const older = stored.story
			? storyMessageIds(stored.story).filter((id) => !shown.has(id))
			: [];
		const evidenceMails =
			older.length === 0
				? []
				: await this.db.emailMessage.findMany({
						where: { id: { in: older }, ...where },
						select: MAIL_SELECT,
					});
		const mails = [...newestMails, ...evidenceMails].sort(
			(a, b) => b.sentAt.getTime() - a.sentAt.getTime(),
		);
		const story = stored.story
			? keepKnownMessages(
					stored.story,
					new Set(
						await this.existingIds(
							contactId,
							storyMessageIds(stored.story),
							mails,
						),
					),
				)
			: null;

		const orderEvents = [
			...orders.map((deal) => ({
				at: (deal.closedAt ?? deal.stageChangedAt).toISOString(),
				kind: "order" as const,
				label: deal.name,
			})),
			...insights
				.filter((insight) => insight.outcome === DEAL_DONE)
				.map((insight) => ({
					at: insight.lastMessageAt.toISOString(),
					kind: "order" as const,
					label: insight.thread.subject ?? "",
				})),
		];

		const marks = new Map<string, string[]>();
		const mark = (messageId: string, text: string) => {
			const list = marks.get(messageId) ?? [];
			if (!list.includes(text)) marks.set(messageId, [...list, text]);
		};
		for (const passage of story?.passages ?? []) {
			mark(passage.messageId, passage.text);
		}
		for (const insight of insights) {
			insight.evidenceMessageIds.forEach((messageId, index) => {
				const quote = insight.evidence[index];
				if (messageId && quote) mark(messageId, quote);
			});
		}

		const waiting = new Set(
			insights
				.filter((insight) => insight.unansweredByUs)
				.map((insight) => insight.threadId),
		);
		const newestOfThread = new Map<string, string>();
		for (const mail of mails) {
			if (!newestOfThread.has(mail.threadId)) {
				newestOfThread.set(mail.threadId, mail.id);
			}
		}

		return {
			contact: {
				id: contact.id,
				firstName: contact.firstName,
				lastName: contact.lastName,
				email: contact.email,
				title: contact.title,
				imageUrl: contact.imageUrl,
				company: contact.company,
			},
			potential: bandOf(candidate.potential),
			waitingOnUs: candidate.waitingOnUs,
			quietDays: candidate.quietDays,
			firstContactAt: candidate.firstContactAt.toISOString(),
			lastContactAt: candidate.lastContactAt.toISOString(),
			feedback: candidate.feedback,
			facts: {
				orders: Math.max(orders.length, candidate.memory.didBusiness),
				maxPallets: candidate.memory.maxPallets,
				products: candidate.memory.products,
				unit: rules.business.unit,
			},
			story,
			storyState: { queued, stale, writtenAt: stored.writtenAt },
			brief: contact.memory?.brief ?? null,
			timeline: [
				...orderEvents,
				...ticks.map((tick) => ({
					at: tick.sentAt.toISOString(),
					kind: "mail" as const,
					label: tick.subject ?? "",
				})),
			].sort((a, b) => a.at.localeCompare(b.at)),
			mails: mails.map((mail) => ({
				id: mail.id,
				threadId: mail.threadId,
				subject: mail.subject,
				direction: mail.direction,
				fromName: mail.fromName,
				fromEmail: mail.fromEmail,
				sentAt: mail.sentAt.toISOString(),
				body: mail.body?.slice(0, PERSON_VIEW.bodyMaxChars) ?? null,
				summary: mail.summary,
				...mailboxLinkOf(mail),
				marks: marks.get(mail.id) ?? [],
				key: story?.stopped?.quote?.messageId === mail.id,
				unanswered:
					mail.direction === "INBOUND" &&
					waiting.has(mail.threadId) &&
					newestOfThread.get(mail.threadId) === mail.id,
			})),
			mailCount,
			next: await this.next(contactId, rules),
			followUpDays: isAgentFunctionEnabled(
				await readAgentFunctions(this.db),
				WIN_BACK_FOLLOW_UP_FUNCTION,
			)
				? WIN_BACK.followUp.afterDays
				: null,
		};
	}

	async rereadStory(contactId: string): Promise<{ queued: boolean }> {
		const contact = await this.db.contact.findUnique({
			where: { id: contactId },
			select: { id: true },
		});
		if (!contact) {
			throw new NotFoundException(`No contact with id ${contactId}.`);
		}

		const queued = await this.agent.personStoryRequested(contactId, true);
		return { queued: queued || (await this.storyQueued(contactId)) };
	}

	private async storedStory(
		contactId: string,
		row: { story: unknown; updatedAt: Date } | null,
	): Promise<StoredStory> {
		if (!row) return { story: null, stale: false, writtenAt: null };

		const parsed = parsePersonStory(row.story);
		if (!parsed.ok) {
			this.logger.error({
				message: "A stored win back story does not parse",
				contactId,
				reason: parsed.reason,
			});
			return { story: null, stale: true, writtenAt: null };
		}

		return {
			story: parsed.story,
			stale: false,
			writtenAt: row.updatedAt.toISOString(),
		};
	}

	private async storyQueued(contactId: string): Promise<boolean> {
		const open = await this.db.agentTask.findFirst({
			where: { contactId, kind: STORY_KIND, finishedAt: null },
			select: { id: true },
		});
		return open !== null;
	}

	private async queueStory(
		contactId: string,
		wanted: boolean,
		newestAt: Date | null,
	): Promise<boolean> {
		if (await this.storyQueued(contactId)) return true;
		if (!wanted || newestAt === null) return false;

		const recent = await this.db.agentTask.findFirst({
			where: {
				contactId,
				kind: STORY_KIND,
				finishedAt: {
					gte: new Date(
						Math.max(newestAt.getTime(), Date.now() - PERSON_VIEW.retryAfterMs),
					),
				},
			},
			select: { id: true },
		});
		if (recent) return false;

		return this.agent.personStoryRequested(contactId, false);
	}

	private async existingIds(
		contactId: string,
		ids: string[],
		loaded: { id: string }[],
	): Promise<string[]> {
		const known = new Set(loaded.map((mail) => mail.id));
		const missing = ids.filter((id) => !known.has(id));
		if (missing.length === 0) return [...known];

		const found = await this.db.emailMessage.findMany({
			where: { id: { in: missing }, thread: { contactId } },
			select: { id: true },
		});
		return [...known, ...found.map((row) => row.id)];
	}

	private async next(
		contactId: string,
		rules: Awaited<ReturnType<typeof readWinBackRules>>,
	): Promise<{ id: string; name: string } | null> {
		const report = await listReactivationCandidates(this.db, {
			rejected: false,
			quietForDays: 0,
			limit: REACTIVATION.limit.max,
			ownerId: null,
			rules,
		});
		const order = sortGroups(report.groups, "potential", "desc").flatMap(
			(group) => group.people,
		);
		const index = order.findIndex((person) => person.contact.id === contactId);
		const after = [...order.slice(index + 1), ...order.slice(0, index)];
		const next = after.find(
			(person) =>
				person.feedback === null &&
				person.contact.email !== null &&
				person.contact.id !== contactId,
		);

		return next ? { id: next.contact.id, name: nameOf(next.contact) } : null;
	}
}

function bandOf(value: string | null): "high" | "medium" | "low" | null {
	return value === "high" || value === "medium" || value === "low"
		? value
		: null;
}
