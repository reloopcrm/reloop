import { db } from "@crm/db";
import {
	type ContactSignals,
	contactWorth,
	type QuantityRule,
} from "@crm/db/contact-worth";
import { readWinBackRules } from "@crm/validation/win-back-rules";

export const PRUNE = {
	batch: 200,
	page: 400,
	scan: 20_000,
} as const;

async function ownDomains(): Promise<Set<string>> {
	const [workspace, mailboxes, users] = await Promise.all([
		db.organization.findFirst({ select: { website: true } }),
		db.imapAccount.findMany({ select: { email: true } }),
		db.user.findMany({ select: { email: true } }),
	]);

	const domains = new Set<string>();
	const add = (value: string | null | undefined) => {
		const host = (value ?? "").trim().toLowerCase().split("@").pop() ?? "";
		const bare = host.replace(/^www\./, "");
		if (bare.includes(".")) domains.add(bare);
	};

	add(workspace?.website);
	for (const mailbox of mailboxes) add(mailbox.email);
	for (const user of users) add(user.email);

	return domains;
}

export async function archiveOwnContacts(): Promise<number> {
	const domains = [...(await ownDomains())];
	if (domains.length === 0) return 0;

	const contacts = await db.contact.findMany({
		where: {
			archivedAt: null,
			OR: domains.map((domain) => ({
				email: { endsWith: `@${domain}`, mode: "insensitive" as const },
			})),
		},
		select: { id: true },
	});

	if (contacts.length === 0) return 0;

	await db.contact.updateMany({
		where: { id: { in: contacts.map((contact) => contact.id) } },
		data: { archivedAt: new Date() },
	});

	return contacts.length;
}

export type Candidate = {
	potential: { verdict: string } | null;
	deals: { dealId: string }[];
	memory: { maxPallets: number | null } | null;
	emailThreads: {
		insight: {
			relevant: boolean;
			outcome: string;
			quantityPallets: number | null;
			unansweredByUs: boolean;
			products: string[];
			topics: string[];
		} | null;
	}[];
};

export function signalsOf(
	candidate: Candidate,
	products: readonly string[] = [],
): ContactSignals {
	const insights = candidate.emailThreads
		.map((thread) => thread.insight)
		.filter((insight) => insight !== null);

	return {
		hasDeal: candidate.deals.length > 0,
		verdict: candidate.potential?.verdict ?? null,
		insights,
		unreadThreads: candidate.emailThreads.filter(
			(thread) => thread.insight === null,
		).length,
		knownPallets: candidate.memory?.maxPallets ?? null,
		products,
	};
}

export function worthKeeping(
	candidate: Candidate,
	rule: QuantityRule,
	products: readonly string[] = [],
): boolean {
	return contactWorth(signalsOf(candidate, products), rule) !== null;
}

export async function pruneContacts(): Promise<number> {
	const rules = await readWinBackRules(db);
	const rule: QuantityRule = {
		minPallets: rules.business.minPallets,
		minBoxes: rules.business.minBoxes,
		boxProducts: rules.business.boxProducts,
	};
	const products = rules.business.products;

	const drop: string[] = [];
	let cursor: string | undefined;
	let scanned = 0;

	while (drop.length < PRUNE.batch && scanned < PRUNE.scan) {
		const page = await db.contact.findMany({
			where: {
				archivedAt: null,
				source: "EMAIL",
				emailThreads: { some: {} },
			},
			orderBy: { id: "asc" },
			take: PRUNE.page,
			cursor: cursor ? { id: cursor } : undefined,
			skip: cursor ? 1 : undefined,
			select: {
				id: true,
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
			},
		});

		if (page.length === 0) break;

		scanned += page.length;
		cursor = page[page.length - 1]?.id;

		for (const candidate of page) {
			if (drop.length >= PRUNE.batch) break;
			if (!worthKeeping(candidate, rule, products)) {
				drop.push(candidate.id);
			}
		}

		if (page.length < PRUNE.page) break;
	}

	if (drop.length === 0) return 0;

	await db.contact.updateMany({
		where: { id: { in: drop } },
		data: { archivedAt: new Date() },
	});

	return drop.length;
}

export async function pruneCompanies(): Promise<number> {
	const companies = await db.company.findMany({
		where: {
			archivedAt: null,
			source: "EMAIL",
			contacts: { none: { archivedAt: null } },
			deals: { none: {} },
		},
		orderBy: { id: "asc" },
		take: PRUNE.batch,
		select: { id: true },
	});

	if (companies.length === 0) return 0;

	await db.company.updateMany({
		where: { id: { in: companies.map((company) => company.id) } },
		data: { archivedAt: new Date() },
	});

	return companies.length;
}
