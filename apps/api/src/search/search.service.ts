import type { Db } from "@crm/db";
import { SEARCH } from "@crm/validation/search";
import { Injectable } from "@nestjs/common";
import { contactSearchFilter } from "../contacts/contacts.service";
import { InjectDatabase } from "../database/database.constants";
import { archivedFilter } from "../trpc/list-input";

export type SearchHit = {
	kind: "company" | "contact" | "deal";
	id: string;
	label: string | null;
	detail: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	imageUrl: string | null;
};

@Injectable()
export class SearchService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async quick(q: string): Promise<{ hits: SearchHit[] }> {
		const term = q.trim();
		if (term.length < SEARCH.minLength) return { hits: [] };

		const [companies, contacts, deals] = await Promise.all([
			this.db.company.findMany({
				where: {
					AND: [
						{
							OR: [
								{ name: { contains: term, mode: "insensitive" } },
								{ domain: { contains: term, mode: "insensitive" } },
							],
						},
						archivedFilter(false),
					],
				},
				take: SEARCH.perKind,
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
				},
			}),
			this.db.contact.findMany({
				where: { AND: [contactSearchFilter(term), archivedFilter(false)] },
				take: SEARCH.perKind,
				orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					imageUrl: true,
					company: { select: { name: true } },
				},
			}),
			this.db.deal.findMany({
				where: {
					AND: [
						{ name: { contains: term, mode: "insensitive" } },
						archivedFilter(false),
					],
				},
				take: SEARCH.perKind,
				orderBy: [{ stage: "asc" }, { name: "asc" }],
				select: {
					id: true,
					name: true,
					company: {
						select: {
							name: true,
							iconUrl: true,
							iconDarkUrl: true,
							iconTone: true,
						},
					},
				},
			}),
		]);

		return {
			hits: [
				...companies.map(
					(company): SearchHit => ({
						kind: "company",
						id: company.id,
						label: company.name,
						detail: company.domain,
						iconUrl: company.iconUrl,
						iconDarkUrl: company.iconDarkUrl,
						iconTone: company.iconTone,
						imageUrl: null,
					}),
				),
				...contacts.map(
					(contact): SearchHit => ({
						kind: "contact",
						id: contact.id,
						label:
							[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
							(contact.email ?? null),
						detail: contact.company?.name ?? contact.email,
						iconUrl: null,
						iconDarkUrl: null,
						iconTone: null,
						imageUrl: contact.imageUrl,
					}),
				),
				...deals.map(
					(deal): SearchHit => ({
						kind: "deal",
						id: deal.id,
						label: deal.name,
						detail: deal.company.name,
						iconUrl: deal.company.iconUrl,
						iconDarkUrl: deal.company.iconDarkUrl,
						iconTone: deal.company.iconTone,
						imageUrl: null,
					}),
				),
			],
		};
	}
}
