import type { Db } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { CompaniesService } from "../companies/companies.service";
import { ContactsService } from "../contacts/contacts.service";
import { fromCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";
import { ConversationService } from "../google/conversation.service";
import { reactivationListInput } from "../reactivation/reactivation.contracts";
import { ReactivationService } from "../reactivation/reactivation.service";
import { WinBackPersonService } from "../reactivation/win-back-person.service";
import { SearchService } from "../search/search.service";
import { MCP } from "./mcp.config";
import type { McpCaller } from "./mcp-caller";
import {
	clip,
	clipOrNull,
	label,
	personName,
	recordRef,
	recordUrl,
	summary,
} from "./mcp-text";
import {
	type ContactDraftToolOutput,
	type ContactMailsToolOutput,
	type ContactToolOutput,
	type FetchToolOutput,
	parseRecordRef,
	type SearchToolOutput,
	type ThreadToolOutput,
	type WinBackToolInput,
	type WinBackToolOutput,
} from "./mcp-tools.contracts";

type WinBackPerson = Awaited<ReturnType<WinBackPersonService["person"]>>;

function line(name: string, value: string | number | null | undefined) {
	return value === null || value === undefined || value === ""
		? []
		: [`${name}: ${value}`];
}

function money(cents: number | null, currency: string | null): string | null {
	const amount = fromCents(cents);
	return amount === null ? null : `${amount} ${currency ?? ""}`.trim();
}

@Injectable()
export class McpToolsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly search: SearchService,
		private readonly contacts: ContactsService,
		private readonly companies: CompaniesService,
		private readonly deals: DealsService,
		private readonly reactivation: ReactivationService,
		private readonly winBackPerson: WinBackPersonService,
		private readonly conversations: ConversationService,
	) {}

	async searchRecords(query: string): Promise<SearchToolOutput> {
		const { hits } = await this.search.quick(query);

		return {
			results: hits.slice(0, MCP.limits.search.results).map((hit) => ({
				id: recordRef(hit.kind, hit.id),
				title: label(hit.label ?? hit.detail) ?? recordRef(hit.kind, hit.id),
				url: recordUrl(hit.kind, hit.id),
			})),
		};
	}

	async fetchRecord(value: string): Promise<FetchToolOutput> {
		const ref = parseRecordRef(value);
		if (!ref) throw new NotFoundException(MCP.messages.unknownRecord);

		if (ref.kind === "contact") return this.fetchContact(ref.id);
		if (ref.kind === "company") return this.fetchCompany(ref.id);
		return this.fetchDeal(ref.id);
	}

	private async fetchContact(id: string): Promise<FetchToolOutput> {
		const [contact, attention] = await Promise.all([
			this.contacts.byId(id),
			this.contacts.attention(id),
		]);
		const name = personName(contact.firstName, contact.lastName, contact.email);
		const text = [
			`Contact: ${name}`,
			...line("Title", contact.title),
			...line("Company", contact.company?.name),
			...line("Email", contact.email),
			...line("Phone", contact.phone),
			...line("Owner", contact.owner?.name),
			...contact.deals
				.slice(0, MCP.limits.contact.deals)
				.map((deal) =>
					[
						`Deal: ${deal.name} (${deal.stage})`,
						money(deal.amountCents, deal.currency),
					]
						.filter(Boolean)
						.join(", "),
				),
			...line("Brief", summary(contact.brief?.narrative)),
			...line("Situation", summary(attention.summary)),
			...line("Quiet for days", attention.quietDays),
			...line("Emails", attention.emails),
			...line("First contact", attention.firstContactAt),
			...line("Last inbound", attention.lastInbound?.at),
			...line("Last outbound", attention.lastOutbound?.at),
		].join("\n");

		return {
			id: recordRef("contact", id),
			title: name,
			text: clip(text, MCP.limits.fetch.textChars),
			url: recordUrl("contact", id),
			metadata: { kind: "contact", detail: label(contact.company?.name) },
		};
	}

	private async fetchCompany(id: string): Promise<FetchToolOutput> {
		const company = await this.companies.byId(id);
		const place = [company.city, company.country].filter(Boolean).join(", ");
		const text = [
			`Company: ${company.name}`,
			...line("Domain", company.domain),
			...line("Website", company.website),
			...line("Industry", company.industry),
			...line("Location", place),
			...line("Phone", company.phone),
			...line("Email", company.email),
			...line(
				"Primary contact",
				company.primaryContact
					? personName(
							company.primaryContact.firstName,
							company.primaryContact.lastName,
							company.primaryContact.email,
						)
					: null,
			),
			...line("Deals", company.dealCount),
			...company.deals
				.slice(0, MCP.limits.contact.deals)
				.map((deal) =>
					[
						`Deal: ${deal.name} (${deal.stage})`,
						money(deal.amountCents, deal.currency),
					]
						.filter(Boolean)
						.join(", "),
				),
			...line("Description", summary(company.description)),
		].join("\n");

		return {
			id: recordRef("company", id),
			title: label(company.name) ?? recordRef("company", id),
			text: clip(text, MCP.limits.fetch.textChars),
			url: recordUrl("company", id),
			metadata: { kind: "company", detail: label(company.domain) },
		};
	}

	private async fetchDeal(id: string): Promise<FetchToolOutput> {
		const deal = await this.deals.byId(id);
		const text = [
			`Deal: ${deal.name}`,
			...line("Stage", deal.stage),
			...line("Amount", money(deal.amountCents, deal.currency)),
			...line("Expected close", deal.expectedCloseDate),
			...line("Closed", deal.closedAt),
			...line("Closed reason", summary(deal.closedReason)),
			...line("Company", deal.company.name),
			...line("Owner", deal.owner?.name),
			...deal.contacts
				.slice(0, MCP.limits.contact.deals)
				.map(
					(contact) =>
						`Contact: ${personName(contact.firstName, contact.lastName, contact.email)}`,
				),
			...line("Description", summary(deal.description)),
		].join("\n");

		return {
			id: recordRef("deal", id),
			title: label(deal.name) ?? recordRef("deal", id),
			text: clip(text, MCP.limits.fetch.textChars),
			url: recordUrl("deal", id),
			metadata: { kind: "deal", detail: label(deal.company.name) },
		};
	}

	async winBack(
		caller: McpCaller,
		input: WinBackToolInput,
	): Promise<WinBackToolOutput> {
		const parsed = reactivationListInput.parse({
			q: input.q,
			potential: input.potential,
			scope: input.scope,
			page: input.page,
			pageSize: input.pageSize ?? MCP.limits.winBack.rows,
		});
		const list = await this.reactivation.list(caller.userId, parsed);

		return {
			rows: list.rows.map((row) => ({
				name: personName(row.name, null),
				company: row.company
					? {
							id: row.company.id,
							name: personName(row.company.name, null),
							url: recordUrl("company", row.company.id),
						}
					: null,
				potential: row.potential,
				quietDays: row.quietDays,
				waitingOnUs: row.waitingOnUs,
				lastContactAt: row.lastContactAt,
				memorySummary: summary(row.memory.summary),
				people: row.people.map((one) => ({
					contactId: one.id,
					name: personName(one.firstName, one.lastName, one.email),
					email: one.email,
					title: label(one.title),
					url: recordUrl("contact", one.id),
					potential: one.potential,
					quietDays: one.quietDays,
					waitingOnUs: one.waitingOnUs,
					lastContactAt: one.lastContactAt,
					memorySummary: summary(one.memory.summary),
				})),
			})),
			total: list.total,
			people: list.people,
			bands: list.bands,
			page: parsed.page,
			pageSize: parsed.pageSize,
			truncated: list.truncated,
			quietForDays: list.quietForDays,
		};
	}

	async contact(contactId: string): Promise<ContactToolOutput> {
		const contact = await this.contacts.byId(contactId);
		const view = await this.personView(contactId);

		return {
			id: contact.id,
			name: personName(contact.firstName, contact.lastName, contact.email),
			email: contact.email,
			phone: contact.phone,
			title: label(contact.title),
			url: recordUrl("contact", contact.id),
			company: contact.company
				? {
						id: contact.company.id,
						name: personName(contact.company.name, null),
						domain: contact.company.domain,
						industry: label(contact.company.industry),
						url: recordUrl("company", contact.company.id),
					}
				: null,
			owner: contact.owner
				? { name: label(contact.owner.name), email: contact.owner.email }
				: null,
			deals: contact.deals.slice(0, MCP.limits.contact.deals).map((deal) => ({
				id: deal.id,
				name: personName(deal.name, null),
				stage: deal.stage,
				role: deal.role,
				amount: fromCents(deal.amountCents),
				currency: deal.currency,
				expectedCloseDate: deal.expectedCloseDate,
				url: recordUrl("deal", deal.id),
			})),
			brief: summary(contact.brief?.narrative),
			winBack: view
				? {
						potential: view.potential,
						quietDays: view.quietDays,
						waitingOnUs: view.waitingOnUs,
						firstContactAt: view.firstContactAt,
						lastContactAt: view.lastContactAt,
						brief: summary(view.brief),
						story: view.story
							? {
									gist: view.story.gist,
									together: view.story.together?.text ?? null,
									stopped: view.story.stopped?.text ?? null,
									stoppedQuote: view.story.stopped?.quote?.text ?? null,
									bringBack: view.story.bringBack?.text ?? null,
									bringBackPoints: view.story.bringBack?.points ?? [],
								}
							: null,
						facts: {
							orders: view.facts.orders,
							maxPallets: view.facts.maxPallets,
							products: view.facts.products,
							unit: view.facts.unit,
						},
					}
				: null,
		};
	}

	async contactMails(contactId: string): Promise<ContactMailsToolOutput> {
		const view = await this.personView(contactId);
		if (!view) return { contactId, mailCount: 0, mails: [] };

		return {
			contactId,
			mailCount: view.mailCount,
			mails: view.mails.slice(0, MCP.limits.contact.mails).map((mail) => ({
				id: mail.id,
				threadId: mail.threadId,
				subject: label(mail.subject),
				direction: mail.direction,
				from: { name: label(mail.fromName), email: mail.fromEmail },
				sentAt: mail.sentAt,
				summary: summary(mail.summary),
				body: clipOrNull(mail.body, MCP.limits.contact.bodyChars),
				marks: mail.marks,
				key: mail.key,
				unanswered: mail.unanswered,
			})),
		};
	}

	async contactDraft(contactId: string): Promise<ContactDraftToolOutput> {
		const state = await this.contacts.draft(contactId);

		return {
			contactId: state.contactId,
			queued: state.queued,
			waitingUntil: state.waitingUntil,
			draft: state.draft
				? {
						subject: label(state.draft.subject) ?? "",
						body: clip(state.draft.body, MCP.limits.draft.bodyChars),
						language: state.draft.language,
						writtenAt: state.draft.writtenAt,
						stale: state.draft.stale,
					}
				: null,
		};
	}

	async thread(threadId: string): Promise<ThreadToolOutput> {
		const thread = await this.conversations.thread(threadId);

		return {
			id: thread.id,
			subject: label(thread.subject),
			company: thread.company
				? {
						id: thread.company.id,
						name: personName(thread.company.name, null),
					}
				: null,
			contact: thread.contact
				? {
						id: thread.contact.id,
						name: personName(thread.contact.firstName, thread.contact.lastName),
					}
				: null,
			summary: summary(thread.insight?.summary),
			outcome: label(thread.insight?.outcome),
			messageCount: thread.messageCount,
			firstMessageAt: thread.firstMessageAt,
			lastMessageAt: thread.lastMessageAt,
			messages: thread.messages
				.slice(-MCP.limits.thread.messages)
				.map((message) => ({
					id: message.id,
					direction: message.direction,
					from: { name: label(message.fromName), email: message.fromEmail },
					recipients: message.recipients
						.slice(0, MCP.limits.thread.recipients)
						.map((recipient) => ({
							email: recipient.email,
							name: label(recipient.name),
							kind: recipient.kind,
						})),
					sentAt: message.sentAt,
					summary: summary(message.summary),
					body: clipOrNull(
						message.body ?? message.snippet,
						MCP.limits.thread.bodyChars,
					),
				})),
		};
	}

	private async personView(contactId: string): Promise<WinBackPerson | null> {
		try {
			return await this.winBackPerson.person(contactId);
		} catch (error) {
			if (!(error instanceof NotFoundException)) throw error;

			const exists = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { id: true },
			});
			if (!exists) throw error;

			return null;
		}
	}
}
