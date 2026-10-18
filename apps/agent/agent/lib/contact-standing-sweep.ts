import { db } from "@crm/db";
import {
	CONTACT_POTENTIAL,
	CONTACT_STANDING,
	type ContactPotential,
	type ContactStanding,
	standingOf,
} from "@crm/db/contact-standing";
import type { QuantityRule } from "@crm/db/contact-worth";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { signalsOf } from "./contact-prune";
import { DISPATCH } from "./dispatch-config";

const STANDING_ORDER = [
	CONTACT_STANDING.watch,
	CONTACT_STANDING.interested,
	CONTACT_STANDING.customer,
] as const;

const POTENTIAL_ORDER = [
	CONTACT_POTENTIAL.low,
	CONTACT_POTENTIAL.medium,
	CONTACT_POTENTIAL.high,
] as const;

const CONTACT_SELECT = {
	id: true,
	companyId: true,
	standing: true,
	potentialBand: true,
	potential: { select: { verdict: true } },
	deals: { select: { dealId: true } },
	memory: { select: { maxPallets: true } },
	emailThreads: {
		select: {
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
	},
} as const;

type Verdict = { standing: ContactStanding; potential: ContactPotential };

type Batch = { verdict: Verdict; ids: string[] };

type Band = { standing: string | null; potentialBand: string | null };

function asStanding(value: string | null): ContactStanding {
	return (
		STANDING_ORDER.find((entry) => entry === value) ?? CONTACT_STANDING.watch
	);
}

function asPotential(value: string | null): ContactPotential {
	return (
		POTENTIAL_ORDER.find((entry) => entry === value) ?? CONTACT_POTENTIAL.low
	);
}

function same(row: Band, verdict: Verdict): boolean {
	return (
		row.standing === verdict.standing && row.potentialBand === verdict.potential
	);
}

function note(batches: Map<string, Batch>, verdict: Verdict, id: string): void {
	const key = `${verdict.standing}:${verdict.potential}`;
	const batch = batches.get(key);

	if (batch) {
		batch.ids.push(id);
		return;
	}

	batches.set(key, { verdict, ids: [id] });
}

async function apply(
	batches: Map<string, Batch>,
	write: (ids: string[], verdict: Verdict) => Promise<number>,
): Promise<number> {
	let changed = 0;

	for (const batch of batches.values()) {
		changed += await write(batch.ids, batch.verdict);
	}

	return changed;
}

function writeContacts(ids: string[], verdict: Verdict): Promise<number> {
	return db.contact
		.updateMany({
			where: { id: { in: ids } },
			data: { standing: verdict.standing, potentialBand: verdict.potential },
		})
		.then((result) => result.count);
}

function writeCompanies(ids: string[], verdict: Verdict): Promise<number> {
	return db.company
		.updateMany({
			where: { id: { in: ids } },
			data: { standing: verdict.standing, potentialBand: verdict.potential },
		})
		.then((result) => result.count);
}

function rollUp(contacts: readonly Band[]): Verdict {
	let standing: ContactStanding = CONTACT_STANDING.watch;
	let potential: ContactPotential = CONTACT_POTENTIAL.low;

	for (const contact of contacts) {
		const band = asStanding(contact.standing);
		if (STANDING_ORDER.indexOf(band) > STANDING_ORDER.indexOf(standing)) {
			standing = band;
		}

		const reach = asPotential(contact.potentialBand);
		if (POTENTIAL_ORDER.indexOf(reach) > POTENTIAL_ORDER.indexOf(potential)) {
			potential = reach;
		}
	}

	return { standing, potential };
}

async function rollUpCompanies(ids: Set<string>): Promise<number> {
	if (ids.size === 0) return 0;

	const companies = await db.company.findMany({
		where: { id: { in: [...ids] }, archivedAt: null },
		select: {
			id: true,
			standing: true,
			potentialBand: true,
			contacts: {
				where: { archivedAt: null },
				select: { standing: true, potentialBand: true },
			},
		},
	});

	const batches = new Map<string, Batch>();

	for (const company of companies) {
		const verdict = rollUp(company.contacts);
		if (same(company, verdict)) continue;

		note(batches, verdict, company.id);
	}

	return apply(batches, writeCompanies);
}

export async function sweepContactStanding(): Promise<number> {
	const rules = await readWinBackRules(db);
	const rule: QuantityRule = {
		minPallets: rules.business.minPallets,
		minBoxes: rules.business.minBoxes,
		boxProducts: rules.business.boxProducts,
	};
	const products = rules.business.products;

	const batches = new Map<string, Batch>();
	const companies = new Set<string>();
	let cursor: string | undefined;

	while (true) {
		const page = await db.contact.findMany({
			where: { archivedAt: null },
			orderBy: { id: "asc" },
			take: DISPATCH.standing.page,
			cursor: cursor ? { id: cursor } : undefined,
			skip: cursor ? 1 : 0,
			select: CONTACT_SELECT,
		});

		if (page.length === 0) break;

		cursor = page[page.length - 1]?.id;

		for (const row of page) {
			if (row.companyId) companies.add(row.companyId);

			const verdict = standingOf(signalsOf(row, products), rule);
			if (same(row, verdict)) continue;

			note(batches, verdict, row.id);
		}

		if (page.length < DISPATCH.standing.page) break;
	}

	const changed = await apply(batches, writeContacts);

	return changed + (await rollUpCompanies(companies));
}
