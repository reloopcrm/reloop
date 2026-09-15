import { isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth";
import { type Db, type Prisma, RecordSource } from "@crm/db";
import { readProviderUsage } from "@crm/db/provider-usage";
import {
	listReactivationCandidates,
	REACTIVATION,
	type ReactivationCandidate,
	type ReactivationGroup,
} from "@crm/db/reactivation";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	readWinBackRules,
	readWinBackRulesState,
	type WinBackRuleMode,
	type WinBackRules,
	writeWinBackRules,
	writeWinBackRulesState,
} from "@crm/validation/win-back-rules";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { READING } from "./reactivation.config";
import type {
	ReactivationListInput,
	ReactivationListOutput,
	ReadingProgress,
	SetPotentialFeedbackInput,
	WinBackRulesState,
} from "./reactivation.contracts";
import {
	countBands,
	countPeople,
	filterBands,
	groupName,
	pageOf,
	searchGroups,
	sortGroups,
} from "./win-back-groups";

const playbookShape = z.object({
	summary: z.string(),
	offers: z.array(z.string()).catch([]),
	prices: z.array(z.string()).catch([]),
	conditions: z.array(z.string()).catch([]),
	accepts: z.array(z.string()).catch([]),
	declines: z.array(z.string()).catch([]),
});

type RevivedContacts = { contactIds: string[]; companyIds: string[] };

@Injectable()
export class ReactivationService {
	private readonly logger = new Logger(ReactivationService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	private async assertManager(userId: string): Promise<void> {
		if (!isWorkspaceAdmin(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a workspace admin can change these settings.",
			);
		}
	}

	async list(
		userId: string,
		input: ReactivationListInput,
	): Promise<ReactivationListOutput> {
		const rules = await readWinBackRules(this.db);
		const report = await listReactivationCandidates(this.db, {
			rejected: input.rejected,
			quietForDays: input.quietForDays,
			limit: REACTIVATION.limit.max,
			ownerId: input.scope === "me" ? userId : null,
			rules,
		});

		const found = searchGroups(report.groups, input.q);
		const matched = filterBands(found, input.potential);
		const sorted = sortGroups(matched, input.sort, input.dir);

		return {
			rows: pageOf(sorted, input.page, input.pageSize).map(groupShape),
			total: matched.length,
			people: countPeople(matched),
			facetCounts: { potential: countBands(found) },
			truncated: report.truncated,
			quietForDays: report.quietForDays,
			generatedAt: report.generatedAt.toISOString(),
			rules: report.rules,
		};
	}

	async rules(): Promise<WinBackRules> {
		return readWinBackRules(this.db);
	}

	async setRules(
		userId: string,
		rules: WinBackRules,
		keepMode: boolean,
	): Promise<WinBackRules> {
		await this.assertManager(userId);
		const saved = await writeWinBackRules(this.db, rules);
		const state = await readWinBackRulesState(this.db);

		if (!keepMode) {
			await writeWinBackRulesState(this.db, { mode: "manual" });
		} else if (state.mode === "auto") {
			await this.agent.rulesTuneRequested("Business facts changed");
		}

		return saved;
	}

	async rulesState(): Promise<WinBackRulesState> {
		const [state, tuning, verdicts, setting] = await Promise.all([
			readWinBackRulesState(this.db),
			this.db.agentTask.count({
				where: { kind: "rules-tune", finishedAt: null },
			}),
			this.db.potentialFeedback.count(),
			this.db.appSetting.findUnique({
				where: { id: SETTINGS_ID },
				select: {
					workspacePlaybook: true,
					playbookLearnedAt: true,
					playbookOutboundCount: true,
				},
			}),
		]);

		const playbook = playbookShape.safeParse(setting?.workspacePlaybook);

		return {
			mode: state.mode,
			note: state.note,
			tunedAt: state.tunedAt?.toISOString() ?? null,
			tuning: tuning > 0,
			verdicts,
			playbook: playbook.success
				? {
						summary: playbook.data.summary,
						offers: playbook.data.offers,
						prices: playbook.data.prices,
						conditions: playbook.data.conditions,
						accepts: playbook.data.accepts,
						declines: playbook.data.declines,
						learnedAt: setting?.playbookLearnedAt?.toISOString() ?? null,
						sentEmails: setting?.playbookOutboundCount ?? 0,
					}
				: null,
		};
	}

	async setRulesMode(
		userId: string,
		mode: WinBackRuleMode,
	): Promise<WinBackRulesState> {
		await this.assertManager(userId);
		await writeWinBackRulesState(this.db, { mode });
		if (mode === "auto") {
			await this.agent.rulesTuneRequested("Automatic rules switched on");
		}
		return this.rulesState();
	}

	async tuneRulesNow(userId: string): Promise<WinBackRulesState> {
		await this.assertManager(userId);
		await this.agent.rulesTuneRequested("Requested from the win-back page");
		return this.rulesState();
	}

	async setFeedback(
		userId: string,
		input: SetPotentialFeedbackInput,
	): Promise<{ contactIds: string[]; verdict: string | null }> {
		const contactIds = [...new Set(input.contactIds)];

		if (input.verdict === null) {
			const revived = await this.db.$transaction(async (tx) => {
				const archiving = await tx.potentialFeedback.findMany({
					where: { contactId: { in: contactIds }, verdict: "bad" },
					select: { contactId: true },
				});

				await tx.potentialFeedback.deleteMany({
					where: { contactId: { in: contactIds } },
				});

				const contacts = await this.reviveContacts(
					tx,
					archiving.map((row) => row.contactId),
				);
				const companies = await this.reviveCompanies(tx, contacts.companyIds);

				return { contacts: contacts.contactIds, companies };
			});

			for (const contactId of revived.contacts) {
				this.logger.log({
					message: "Contact restored because the bad verdict came off",
					contactId,
				});
			}

			for (const companyId of revived.companies) {
				this.logger.log({
					message: "Company restored because its contact came back",
					companyId,
				});
			}

			return { contactIds, verdict: null };
		}

		const verdict = input.verdict;
		const note = input.note ?? null;

		await this.db.$transaction(
			contactIds.map((contactId) =>
				this.db.potentialFeedback.upsert({
					where: { contactId },
					create: { contactId, verdict, note, userId },
					update: { verdict, note, userId },
					select: { contactId: true },
				}),
			),
		);

		const state = await readWinBackRulesState(this.db);
		if (state.mode === "auto") {
			await this.agent.rulesTuneRequested("A verdict changed");
		}

		return { contactIds, verdict };
	}

	private async reviveContacts(
		tx: Prisma.TransactionClient,
		contactIds: string[],
	): Promise<RevivedContacts> {
		if (contactIds.length === 0) return { contactIds: [], companyIds: [] };

		const archived = await tx.contact.findMany({
			where: {
				id: { in: contactIds },
				archivedAt: { not: null },
				source: RecordSource.EMAIL,
			},
			orderBy: { id: "asc" },
			select: { id: true, email: true, companyId: true },
		});
		if (archived.length === 0) return { contactIds: [], companyIds: [] };

		const emails = archived.flatMap((contact) =>
			contact.email === null ? [] : [contact.email],
		);
		const live = await tx.contact.findMany({
			where: { archivedAt: null, email: { in: emails } },
			select: { email: true },
		});

		const taken = new Set(live.map((contact) => contact.email));
		const revive: string[] = [];
		const companyIds = new Set<string>();

		for (const contact of archived) {
			if (contact.email !== null) {
				if (taken.has(contact.email)) {
					this.logger.log({
						message:
							"Archived contact stays archived because a live contact holds the address",
						contactId: contact.id,
					});
					continue;
				}
				taken.add(contact.email);
			}
			revive.push(contact.id);
			if (contact.companyId !== null) companyIds.add(contact.companyId);
		}

		if (revive.length === 0) return { contactIds: [], companyIds: [] };

		await tx.contact.updateMany({
			where: { id: { in: revive }, archivedAt: { not: null } },
			data: { archivedAt: null },
		});

		return { contactIds: revive, companyIds: [...companyIds] };
	}

	private async reviveCompanies(
		tx: Prisma.TransactionClient,
		companyIds: string[],
	): Promise<string[]> {
		if (companyIds.length === 0) return [];

		const archived = await tx.company.findMany({
			where: {
				id: { in: companyIds },
				archivedAt: { not: null },
				source: RecordSource.EMAIL,
				deals: { none: {} },
			},
			orderBy: { id: "asc" },
			select: { id: true, domain: true },
		});
		if (archived.length === 0) return [];

		const domains = archived.flatMap((company) =>
			company.domain === null ? [] : [company.domain],
		);
		const live = await tx.company.findMany({
			where: { archivedAt: null, domain: { in: domains } },
			select: { domain: true },
		});

		const taken = new Set(live.map((company) => company.domain));
		const revive: string[] = [];

		for (const company of archived) {
			if (company.domain !== null) {
				if (taken.has(company.domain)) {
					this.logger.log({
						message:
							"Archived company stays archived because a live company holds the domain",
						companyId: company.id,
						domain: company.domain,
					});
					continue;
				}
				taken.add(company.domain);
			}
			revive.push(company.id);
		}

		if (revive.length === 0) return [];

		await tx.company.updateMany({
			where: { id: { in: revive }, archivedAt: { not: null } },
			data: { archivedAt: null },
		});

		return revive;
	}

	async progress(): Promise<ReadingProgress> {
		const since = new Date(Date.now() - READING.rateWindowMs);

		const [threads, read, queued, relevant, readRecently, provider] =
			await Promise.all([
				this.db.emailThread.count(),
				this.db.threadInsight.count(),
				this.db.agentTask.count({
					where: { kind: "thread-insight", finishedAt: null },
				}),
				this.db.threadInsight.count({ where: { relevant: true } }),
				this.db.threadInsight.count({ where: { createdAt: { gte: since } } }),
				readProviderUsage(this.db, "chatgpt"),
			]);

		const pending = Math.max(threads - read, queued > 0 ? 1 : 0);
		const perHour = Math.round(
			readRecently * (3_600_000 / READING.rateWindowMs),
		);
		const etaMinutes =
			pending === 0
				? null
				: perHour > 0
					? Math.ceil((pending / perHour) * 60)
					: Math.ceil((pending * READING.assumedSecondsPerThread) / 60);
		const paused =
			pending > 0 &&
			provider?.primaryUsedPercent !== null &&
			provider?.primaryUsedPercent !== undefined &&
			provider.primaryUsedPercent >= 100 &&
			(provider.primaryResetAt?.getTime() ?? 0) > Date.now();

		return { threads, read, pending, relevant, perHour, etaMinutes, paused };
	}
}

function factShape(memory: ReactivationGroup["memory"]) {
	return {
		summary: memory.summary,
		didBusiness: memory.didBusiness,
		openInquiries: memory.openInquiries,
		maxPallets: memory.maxPallets,
		products: memory.products,
		threadsRead: memory.threadsRead,
	};
}

function personShape(person: ReactivationCandidate) {
	return {
		id: person.contact.id,
		firstName: person.contact.firstName,
		lastName: person.contact.lastName,
		email: person.contact.email,
		title: person.contact.title,
		imageUrl: person.contact.imageUrl,
		potential: (person.potential ?? "low") as "high" | "medium" | "low",
		standing: person.standing,
		lastContactAt: person.lastContactAt.toISOString(),
		quietDays: person.quietDays,
		waitingOnUs: person.waitingOnUs,
		feedback: person.feedback,
		memory: factShape(person.memory),
	};
}

function groupShape(group: ReactivationGroup) {
	return {
		key: group.key,
		name: groupName(group),
		company: group.company,
		people: group.people.map(personShape),
		potential: group.potential,
		standing: group.standing,
		lastContactAt: group.lastContactAt.toISOString(),
		quietDays: group.quietDays,
		waitingOnUs: group.waitingOnUs,
		feedback: group.feedback,
		memory: factShape(group.memory),
	};
}
