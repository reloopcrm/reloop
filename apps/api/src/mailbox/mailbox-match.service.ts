import { WORKSPACE_ID } from "@crm/auth";
import { workspaceDomains } from "@crm/auth/workspace";
import { type Db, RecordSource } from "@crm/db";
import { isFreeEmailDomain } from "@crm/db/email-domains";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { planLimitsOf } from "@crm/db/plan-usage";
import { CONTACT_LIMIT_MESSAGE } from "@crm/db/plans";
import { SETTINGS_ID } from "@crm/db/settings";
import type { AgentTaskOrigin } from "@crm/validation/agent-task-payload";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CompanyDirectoryService } from "../companies/company-directory.service";
import { normalizeDomain } from "../companies/domain";
import { EnrichmentLogService } from "../crm/enrichment-log.service";
import { InjectDatabase } from "../database/database.constants";
import { LIMIT_WARNING } from "./mailbox.config";
import {
	dominantDomain,
	externalParticipants,
	isDerivedName,
	type Participant,
	splitName,
	workDomain,
} from "./participants";

export type SyncRecordSource =
	| typeof RecordSource.EMAIL
	| typeof RecordSource.CALENDAR;

export type ContactResearch = { contactId: string; reason: string };

export type MatchResult = {
	companyId: string | null;
	contactId: string | null;
	external: Participant[];
	limited?: true;
	research?: ContactResearch[];
};

type CreatedContact = {
	contactId: string | null;
	limited: boolean;
	research: ContactResearch[];
};

export type AddedContact = {
	contactId: string | null;
	created: boolean;
	limited: boolean;
};

export const contactLimitError = z
	.instanceof(Error)
	.refine((error) => error.message.includes(CONTACT_LIMIT_MESSAGE));

export type MatchContext = {
	ourAddresses: ReadonlySet<string>;
	ourDomains: ReadonlySet<string>;
	suppressedDomains: ReadonlySet<string>;
	suppressedEmails: ReadonlySet<string>;
};

export type MatchRequest = {
	participants: readonly Participant[];
	allowCreate: boolean;
	source: SyncRecordSource;
	ownerId: string;
	deferResearch?: boolean;
};

export type ContactRequest = Pick<MatchRequest, "source" | "ownerId">;

@Injectable()
export class MailboxMatchService {
	private readonly logger = new Logger(MailboxMatchService.name);
	private limitWarnedAt = 0;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompanyDirectoryService,
		private readonly agent: AgentTriggerService,
		private readonly log: EnrichmentLogService,
	) {}

	async internalIdentity(): Promise<{
		addresses: Set<string>;
		domains: Set<string>;
	}> {
		const [users, imapAccounts, syncs, settings, workspace] = await Promise.all(
			[
				this.db.user.findMany({ select: { email: true } }),
				this.db.imapAccount.findMany({ select: { email: true } }),
				this.db.mailboxSync.findMany({
					where: { address: { not: null } },
					select: { address: true },
				}),
				this.db.appSetting.findUnique({
					where: { id: SETTINGS_ID },
					select: { ownAddresses: true },
				}),
				this.db.organization.findUnique({
					where: { id: WORKSPACE_ID },
					select: { website: true },
				}),
			],
		);

		const addresses = new Set<string>();
		const domains = new Set<string>(workspaceDomains());

		const mailboxes = [
			...users.map((user) => user.email),
			...imapAccounts.map((account) => account.email),
			...syncs.map((sync) => sync.address ?? ""),
		];

		for (const mailbox of mailboxes) {
			const email = mailbox.trim().toLowerCase();
			if (!email) continue;
			addresses.add(email);

			const domain = workDomain(email);
			if (domain) domains.add(domain);
		}

		for (const alias of settings?.ownAddresses ?? []) {
			const email = alias.trim().toLowerCase();
			if (email) addresses.add(email);
		}

		const own = normalizeDomain(workspace?.website ?? "");
		if (own) domains.add(own);

		for (const domain of domains) {
			if (isFreeEmailDomain(domain)) domains.delete(domain);
		}

		return { addresses, domains };
	}

	async suppressedDomains(): Promise<Set<string>> {
		const rows = await this.db.suppressedDomain.findMany({
			select: { domain: true },
		});
		return new Set(rows.map((row) => row.domain));
	}

	async suppressedEmails(): Promise<Set<string>> {
		const rows = await this.db.suppressedContact.findMany({
			select: { email: true },
		});
		return new Set(rows.map((row) => row.email.toLowerCase()));
	}

	async resolve(
		request: MatchRequest,
		context: MatchContext,
	): Promise<MatchResult> {
		const external = externalParticipants(request.participants, {
			ourDomains: context.ourDomains,
			ourAddresses: context.ourAddresses,
			suppressedDomains: context.suppressedDomains,
			suppressedEmails: context.suppressedEmails,
		});

		if (external.length === 0) {
			return { companyId: null, contactId: null, external };
		}

		const contact = await this.db.contact.findFirst({
			where: { email: { in: external.map((person) => person.email) } },
			orderBy: { archivedAt: { sort: "asc", nulls: "first" } },
			select: { id: true, companyId: true },
		});

		if (contact) {
			return {
				companyId: contact.companyId,
				contactId: contact.id,
				external,
			};
		}

		const domains = [
			...new Set(
				external
					.map((person) => workDomain(person.email))
					.filter((domain): domain is string => domain !== null),
			),
		];

		const known = await this.db.company.findMany({
			where: { domain: { in: domains } },
			orderBy: { archivedAt: { sort: "asc", nulls: "first" } },
			select: { id: true, domain: true, archivedAt: true },
		});

		const knownDomains = new Set(
			known
				.map((company) => company.domain)
				.filter((domain): domain is string => domain !== null),
		);

		const domain = dominantDomain(external, knownDomains);
		if (!domain) return { companyId: null, contactId: null, external };

		const existing = known.find((company) => company.domain === domain);
		if (existing) {
			const created = request.allowCreate
				? await this.createContact(external, domain, existing.id, request)
				: { contactId: null, limited: false, research: [] };

			if (created.limited) {
				return { companyId: null, contactId: null, external, limited: true };
			}

			if (existing.archivedAt && created.contactId) {
				await this.revive(existing.id, domain);
			}

			return {
				companyId: existing.id,
				contactId: created.contactId,
				external,
				research: created.research,
			};
		}

		if (!request.allowCreate) {
			return { companyId: null, contactId: null, external };
		}

		return this.create(external, domain, request);
	}

	private async revive(companyId: string, domain: string): Promise<void> {
		const live = await this.db.contact.count({
			where: { companyId, archivedAt: null },
		});
		if (live === 0) return;

		const taken = await this.db.company.count({
			where: { domain, archivedAt: null, id: { not: companyId } },
		});
		if (taken > 0) return;

		await this.db.company.updateMany({
			where: { id: companyId, archivedAt: { not: null } },
			data: { archivedAt: null },
		});

		this.logger.log({
			message: "Archived company restored because a live contact reached it",
			companyId,
			domain,
		});
	}

	private async create(
		external: Participant[],
		domain: string,
		request: MatchRequest,
	): Promise<MatchResult> {
		const lead =
			external.find((person) => workDomain(person.email) === domain) ??
			external[0];

		if (!lead) return { companyId: null, contactId: null, external };

		if (await this.atContactLimit()) {
			this.warnLimit();
			return { companyId: null, contactId: null, external, limited: true };
		}

		const companyId = await this.companies.companyForEmail(lead.email, {
			ownerId: request.ownerId,
		});
		if (!companyId) {
			return { companyId: null, contactId: null, external };
		}

		await this.db.company.update({
			where: { id: companyId },
			data: { source: request.source },
		});

		const created = await this.createContact(
			external,
			domain,
			companyId,
			request,
		);

		await this.log.record({
			companyId,
			subject: "Company added from your inbox",
			body:
				request.source === "CALENDAR"
					? "Created because you met someone at {domain}."
					: "Created because you emailed someone at {domain}.",
			meta: { source: request.source, domain },
		});

		this.logger.log({
			message: "Company auto-created from mailbox sync",
			companyId,
			domain,
			source: request.source,
		});

		if (created.limited) {
			return { companyId: null, contactId: null, external, limited: true };
		}

		return {
			companyId,
			contactId: created.contactId,
			external,
			research: created.research,
		};
	}

	async reviveContact(
		person: Participant,
		context: MatchContext,
		mail: { lane: AgentTaskOrigin | null; sentAt: Date },
	): Promise<boolean> {
		if (externalParticipants([person], context).length === 0) return false;

		const email = person.email.toLowerCase();
		const contact = await this.db.contact.findUnique({
			where: { email },
			select: {
				id: true,
				companyId: true,
				archivedAt: true,
				company: { select: { domain: true, archivedAt: true } },
			},
		});
		if (!contact?.archivedAt) return false;
		if (mail.lane !== "forward" && mail.sentAt <= contact.archivedAt) {
			return false;
		}

		let count: number;
		try {
			({ count } = await this.db.contact.updateMany({
				where: { id: contact.id, archivedAt: { not: null } },
				data: { archivedAt: null },
			}));
		} catch (error) {
			if (!contactLimitError.safeParse(error).success) throw error;
			this.warnLimit(contact.id);
			return false;
		}
		if (count === 0) return false;

		if (
			contact.companyId &&
			contact.company?.archivedAt &&
			contact.company.domain
		) {
			await this.revive(contact.companyId, contact.company.domain);
		}

		await this.log.record({
			contactId: contact.id,
			companyId: contact.companyId,
			subject: "Contact restored from the archive",
			body: "{email} wrote again.",
			meta: { email },
		});

		return true;
	}

	private async atContactLimit(): Promise<boolean> {
		const limit = (await planLimitsOf(this.db)).contacts;
		if (limit === null) return false;

		return (
			(await this.db.contact.count({ where: { archivedAt: null } })) >= limit
		);
	}

	private warnLimit(contactId?: string): void {
		const now = Date.now();
		if (now - this.limitWarnedAt < LIMIT_WARNING.intervalMs) return;

		this.limitWarnedAt = now;
		this.logger.warn({
			message:
				"The contact limit is reached. The mailbox sync keeps running and stores new threads as pending",
			contactId,
		});
	}

	private async createContact(
		external: Participant[],
		domain: string,
		companyId: string,
		request: MatchRequest,
	): Promise<CreatedContact> {
		const person = external.find(
			(candidate) => workDomain(candidate.email) === domain,
		);
		if (!person) return { contactId: null, limited: false, research: [] };

		const { added, research } = await this.insertCompanyContact(
			person,
			companyId,
			request,
		);
		const wanted = research ? [research] : [];
		if (!request.deferResearch) await this.queueResearch(wanted);

		return {
			contactId: added.contactId,
			limited: added.limited,
			research: request.deferResearch ? wanted : [],
		};
	}

	async queueResearch(research: readonly ContactResearch[]): Promise<void> {
		for (const { contactId, reason } of research) {
			await this.agent.contactCreated(contactId, reason);
		}
	}

	async addCompanyContact(
		person: Participant,
		companyId: string,
		request: ContactRequest,
		lastMailAt?: Date,
	): Promise<AddedContact> {
		const { added, research } = await this.insertCompanyContact(
			person,
			companyId,
			request,
			lastMailAt,
		);
		if (research) await this.queueResearch([research]);

		return added;
	}

	private async insertCompanyContact(
		person: Participant,
		companyId: string,
		request: ContactRequest,
		lastMailAt?: Date,
	): Promise<{ added: AddedContact; research: ContactResearch | null }> {
		const { firstName, lastName } = splitName(person.name, person.email);

		let outcome: Awaited<ReturnType<MailboxMatchService["insertContact"]>>;
		try {
			outcome = await this.insertContact(
				person,
				{ firstName, lastName },
				companyId,
				request,
			);
		} catch (error) {
			if (!contactLimitError.safeParse(error).success) throw error;
			this.warnLimit();
			return {
				added: { contactId: null, created: false, limited: true },
				research: null,
			};
		}
		const { contact } = outcome;

		if (outcome.created) {
			await this.log.record({
				contactId: contact.id,
				companyId,
				subject: "Contact added from your inbox",
				body:
					request.source === "CALENDAR"
						? "{email} appeared in a meeting."
						: "{email} appeared in a thread.",
				meta: { source: request.source, email: person.email },
				at: lastMailAt,
			});
		}

		const nameless =
			!person.name?.trim() &&
			isDerivedName(person.email, contact.firstName, contact.lastName);
		const research =
			outcome.created || nameless
				? {
						contactId: contact.id,
						reason: nameless
							? "Created by the sync from an address, with no name on it"
							: "Emailed about your business",
					}
				: null;

		return {
			added: {
				contactId: contact.id,
				created: outcome.created,
				limited: false,
			},
			research,
		};
	}

	async contactLimitReached(): Promise<boolean> {
		if (!(await this.atContactLimit())) return false;
		this.warnLimit();
		return true;
	}

	private async insertContact(
		person: Participant,
		name: { firstName: string; lastName: string | null },
		companyId: string,
		request: ContactRequest,
	) {
		const { firstName, lastName } = name;
		return this.agent.withCrmEvents(async (tx, emit) => {
			await lockIdempotencyKey(tx, `mailbox-contact:${person.email}`);
			const existing = await tx.contact.findUnique({
				where: { email: person.email },
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					companyId: true,
					createdAt: true,
				},
			});
			if (existing) return { contact: existing, created: false as const };

			const contact = await tx.contact.create({
				data: {
					firstName,
					lastName,
					email: person.email,
					companyId,
					source: request.source,
					ownerId: request.ownerId,
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					companyId: true,
					createdAt: true,
				},
			});
			await emit({
				type: "contact.created",
				record: { kind: "contact", id: contact.id },
				occurredAt: contact.createdAt,
				data: {
					firstName: contact.firstName,
					lastName: contact.lastName,
					email: contact.email,
					companyId: contact.companyId,
					source: request.source,
				},
			});
			return { contact, created: true as const };
		});
	}
}
