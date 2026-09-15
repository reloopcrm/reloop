import type { Db } from "./client";
import { isBoxThread } from "./contact-worth";
import { OPEN_DEAL_STAGES } from "./deal-stage";
import { Prisma } from "./generated/prisma/client";
import { DealStage } from "./generated/prisma/enums";
import { DEFAULT_WIN_BACK_RULES, type WinBackRuleSet } from "./win-back-rules";

const DAY_MS = 86_400_000;

export const REACTIVATION = {
	quietForDays: { default: 0, min: 0, max: 3650 },
	limit: { default: 50, min: 1, max: 1000 },
	scan: { maxRows: 5000 },
} as const;

export type ReactivationOptions = {
	rejected?: boolean;
	quietForDays?: number;
	limit?: number;
	ownerId?: string | null;
	now?: Date;
	rules?: WinBackRuleSet;
};

export type PointLine = {
	label: string;
	points: number;
	vars?: Record<string, string | number>;
};

export type ReactivationCandidate = {
	contact: {
		id: string;
		firstName: string;
		lastName: string | null;
		email: string | null;
		title: string | null;
		imageUrl: string | null;
		company: { id: string; name: string } | null;
		owner: { id: string; name: string } | null;
	};
	standing: string | null;
	potential: string | null;
	lastContactAt: Date;
	lastInboundAt: Date | null;
	lastOutboundAt: Date | null;
	quietDays: number;
	threads: number;
	messagesFromThem: number;
	messagesFromUs: number;
	meetings: number;
	openDeals: number;
	wonDeals: number;
	lastSubject: string | null;
	waitingOnUs: boolean;
	matchedKeyword: string | null;
	memory: {
		summary: string | null;
		didBusiness: number;
		openInquiries: number;
		maxPallets: number | null;
		products: string[];
		lastOutcome: string | null;
		threadsRead: number;
	};
	feedback: string | null;
	points: number;
	pointLines: PointLine[];
	reasons: string[];
};

export const REACTIVATION_BANDS = ["low", "medium", "high"] as const;

export type ReactivationBand = (typeof REACTIVATION_BANDS)[number];

const BAND_SHARE = { high: 0.6, medium: 0.3 } as const;

const STANDING_ORDER = ["watch", "interested", "customer"] as const;

export function bandRank(band: ReactivationBand): number {
	return REACTIVATION_BANDS.indexOf(band);
}

function standingRank(standing: string | null): number {
	return STANDING_ORDER.findIndex((entry) => entry === standing);
}

export type ReactivationFacts = {
	summary: string | null;
	didBusiness: number;
	openInquiries: number;
	maxPallets: number | null;
	products: string[];
	threadsRead: number;
};

export type ReactivationGroup = {
	key: string;
	company: { id: string; name: string } | null;
	people: ReactivationCandidate[];
	potential: ReactivationBand;
	standing: string | null;
	lastContactAt: Date;
	quietDays: number;
	waitingOnUs: boolean;
	feedback: string | null;
	points: number;
	memory: ReactivationFacts;
};

export type ReactivationReport = {
	candidates: ReactivationCandidate[];
	groups: ReactivationGroup[];
	total: number;
	truncated: boolean;
	quietForDays: number;
	generatedAt: Date;
	rules: WinBackRuleSet;
};

type Row = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
	imageUrl: string | null;
	companyId: string | null;
	companyName: string | null;
	ownerId: string | null;
	ownerName: string | null;
	threads: bigint;
	fromThem: bigint;
	fromUs: bigint;
	lastInbound: Date | null;
	lastOutbound: Date | null;
	lastContact: Date;
	meetings: bigint;
	openDeals: bigint;
	wonDeals: bigint;
	lastSubject: string | null;
	memorySummary: string | null;
	didBusiness: bigint | number | null;
	openInquiries: bigint | number | null;
	maxPallets: number | null;
	memoryProducts: string[] | null;
	standing: string | null;
	potentialBand: string | null;
	lastOutcome: string | null;
	threadsRead: bigint | number | null;
	feedback: string | null;
};

export async function listReactivationCandidates(
	db: Db,
	options: ReactivationOptions = {},
): Promise<ReactivationReport> {
	const now = options.now ?? new Date();
	const quietForDays = clamp(
		options.quietForDays ?? REACTIVATION.quietForDays.default,
		REACTIVATION.quietForDays.min,
		REACTIVATION.quietForDays.max,
	);
	const limit = clamp(
		options.limit ?? REACTIVATION.limit.default,
		REACTIVATION.limit.min,
		REACTIVATION.limit.max,
	);
	const rules = options.rules ?? DEFAULT_WIN_BACK_RULES;
	const cutoff = new Date(now.getTime() - quietForDays * DAY_MS);
	const standingFilter = options.rejected
		? Prisma.sql`fb.verdict = 'bad'`
		: Prisma.sql`c."archivedAt" IS NULL
			AND (fb.verdict IS NULL OR fb.verdict <> 'bad')`;
	const quietFilter =
		quietForDays > 0
			? Prisma.sql`AND mail.last_contact <= ${cutoff}`
			: Prisma.empty;
	const topicFilter = rules.include.requireTopic
		? Prisma.sql`AND mem."didBusiness" IS NOT NULL AND array_length(mem."coveredThreadIds", 1) > 0`
		: Prisma.empty;
	const openStages = Prisma.join(
		OPEN_DEAL_STAGES.map((stage) => Prisma.sql`${stage}::"DealStage"`),
	);
	const ownerFilter = options.ownerId
		? Prisma.sql`AND c."ownerId" = ${options.ownerId}`
		: Prisma.empty;
	const repliedFilter = rules.include.neverReplied
		? Prisma.empty
		: Prisma.sql`AND mail.from_us > 0`;
	const companyFilter = rules.include.requireCompany
		? Prisma.sql`AND co.id IS NOT NULL`
		: Prisma.empty;
	const excluded = rules.excludedDomains.map((domain) => domain.toLowerCase());
	const domainFilter =
		excluded.length > 0
			? Prisma.sql`AND (c.email IS NULL OR split_part(lower(c.email), '@', 2) NOT IN (${Prisma.join(excluded)}))`
			: Prisma.empty;

	const rows = await db.$queryRaw<Row[]>`
		WITH mail AS (
			SELECT
				t."contactId" AS contact_id,
				COUNT(DISTINCT t.id) AS threads,
				COUNT(*) FILTER (WHERE m.direction = 'INBOUND') AS from_them,
				COUNT(*) FILTER (WHERE m.direction = 'OUTBOUND') AS from_us,
				MAX(m."sentAt") FILTER (WHERE m.direction = 'INBOUND') AS last_inbound,
				MAX(m."sentAt") FILTER (WHERE m.direction = 'OUTBOUND') AS last_outbound,
				MAX(m."sentAt") AS last_contact
			FROM "emailThread" t
			JOIN "emailMessage" m ON m."threadId" = t.id
			WHERE t."contactId" IS NOT NULL
			GROUP BY t."contactId"
		)
		SELECT
			c.id,
			c."firstName",
			c."lastName",
			c.email,
			c.title,
			c."imageUrl",
			c.standing AS "standing",
			c.potential AS "potentialBand",
			co.id AS "companyId",
			co.name AS "companyName",
			u.id AS "ownerId",
			u.name AS "ownerName",
			mail.threads,
			mail.from_them AS "fromThem",
			mail.from_us AS "fromUs",
			mail.last_inbound AS "lastInbound",
			mail.last_outbound AS "lastOutbound",
			mail.last_contact AS "lastContact",
			(
				SELECT COUNT(*) FROM "calendarAttendee" a WHERE a."contactId" = c.id
			) AS meetings,
			(
				SELECT COUNT(*) FROM "dealContact" dc
				JOIN deal d ON d.id = dc."dealId"
				WHERE dc."contactId" = c.id
					AND d."archivedAt" IS NULL
					AND d.stage IN (${openStages})
			) AS "openDeals",
			(
				SELECT COUNT(*) FROM "dealContact" dc
				JOIN deal d ON d.id = dc."dealId"
				WHERE dc."contactId" = c.id
					AND d."archivedAt" IS NULL
					AND d.stage = ${DealStage.CLOSED_WON}::"DealStage"
			) AS "wonDeals",
			(
				SELECT t.subject FROM "emailThread" t
				WHERE t."contactId" = c.id
				ORDER BY t."lastMessageAt" DESC
				LIMIT 1
			) AS "lastSubject",
			mem.summary AS "memorySummary",
			mem."didBusiness" AS "didBusiness",
			mem."openInquiries" AS "openInquiries",
			mem."maxPallets" AS "maxPallets",
			mem.products AS "memoryProducts",
			mem."lastOutcome" AS "lastOutcome",
			COALESCE(array_length(mem."coveredThreadIds", 1), 0) AS "threadsRead",
			fb.verdict AS feedback
		FROM contact c
		JOIN mail ON mail.contact_id = c.id
		LEFT JOIN company co ON co.id = c."companyId" AND co."archivedAt" IS NULL
		LEFT JOIN "user" u ON u.id = c."ownerId"
		LEFT JOIN "contactMemory" mem ON mem."contactId" = c.id
		LEFT JOIN "potentialFeedback" fb ON fb."contactId" = c.id
		WHERE ${standingFilter}
			${quietFilter}
			${topicFilter}
			AND (mail.from_us + mail.from_them) >= ${rules.include.minEmails}
			AND mail.from_them >= ${rules.include.minFromThem}
			${repliedFilter}
			${companyFilter}
			${domainFilter}
			${ownerFilter}
		ORDER BY mail.last_contact DESC, c.id
		LIMIT ${REACTIVATION.scan.maxRows}
	`;

	const scored = rows
		.map((row) => candidateOf(row, now, rules))
		.filter((candidate) => passesRules(candidate, rules))
		.sort(
			(a, b) =>
				b.points - a.points ||
				b.lastContactAt.getTime() - a.lastContactAt.getTime(),
		);

	const best = scored.reduce((top, candidate) => {
		return Math.max(top, candidate.points);
	}, 0);
	const ranked = scored.map((candidate) => ({
		...candidate,
		potential: bandOf(candidate, best),
	}));

	return {
		candidates: ranked.slice(0, limit),
		groups: groupCandidates(ranked),
		total: ranked.length,
		truncated: rows.length >= REACTIVATION.scan.maxRows,
		quietForDays,
		generatedAt: now,
		rules,
	};
}

function asBand(value: string | null): ReactivationBand | null {
	return REACTIVATION_BANDS.find((band) => band === value) ?? null;
}

function bandOf(
	candidate: ReactivationCandidate,
	best: number,
): ReactivationBand {
	const stored = asBand(candidate.potential);
	if (stored) return stored;
	if (best <= 0) return "low";

	const share = candidate.points / best;
	if (share >= BAND_SHARE.high) return "high";
	if (share >= BAND_SHARE.medium) return "medium";

	return "low";
}

function sharedVerdict(
	people: readonly ReactivationCandidate[],
): string | null {
	const first = people[0]?.feedback ?? null;

	return people.every((person) => person.feedback === first) ? first : null;
}

function rolledFacts(people: readonly ReactivationCandidate[]) {
	const products = new Set<string>();
	let summary: string | null = null;
	let didBusiness = 0;
	let openInquiries = 0;
	let maxPallets: number | null = null;
	let threadsRead = 0;

	for (const person of people) {
		const memory = person.memory;
		didBusiness += memory.didBusiness;
		openInquiries += memory.openInquiries;
		threadsRead += memory.threadsRead;
		summary ??= memory.summary;

		if (
			memory.maxPallets !== null &&
			(maxPallets === null || memory.maxPallets > maxPallets)
		) {
			maxPallets = memory.maxPallets;
		}
		for (const product of memory.products) products.add(product);
	}

	return {
		summary,
		didBusiness,
		openInquiries,
		maxPallets,
		products: [...products],
		threadsRead,
	} satisfies ReactivationFacts;
}

function groupOf(
	key: string,
	people: ReactivationCandidate[],
): ReactivationGroup {
	let potential: ReactivationBand = "low";
	let standing: string | null = null;
	let lastContactAt = people[0]?.lastContactAt ?? new Date(0);
	let quietDays = people[0]?.quietDays ?? 0;
	let points = 0;

	for (const person of people) {
		const band = asBand(person.potential) ?? "low";
		if (bandRank(band) > bandRank(potential)) potential = band;

		if (standingRank(person.standing) > standingRank(standing)) {
			standing = person.standing;
		}

		if (person.lastContactAt > lastContactAt) {
			lastContactAt = person.lastContactAt;
			quietDays = person.quietDays;
		}
		points = Math.max(points, person.points);
	}

	return {
		key,
		company: people[0]?.contact.company ?? null,
		people,
		potential,
		standing,
		lastContactAt,
		quietDays,
		waitingOnUs: people.some((person) => person.waitingOnUs),
		feedback: sharedVerdict(people),
		points,
		memory: rolledFacts(people),
	};
}

export function groupCandidates(
	candidates: readonly ReactivationCandidate[],
): ReactivationGroup[] {
	const buckets = new Map<string, ReactivationCandidate[]>();

	for (const candidate of candidates) {
		const company = candidate.contact.company;
		const key = company
			? `company:${company.id}`
			: `person:${candidate.contact.id}`;
		const bucket = buckets.get(key);

		if (bucket) bucket.push(candidate);
		else buckets.set(key, [candidate]);
	}

	return [...buckets.entries()]
		.map(([key, people]) => groupOf(key, people))
		.sort(
			(a, b) =>
				b.points - a.points ||
				b.lastContactAt.getTime() - a.lastContactAt.getTime(),
		);
}

function passesRules(
	candidate: ReactivationCandidate,
	rules: WinBackRuleSet,
): boolean {
	if (
		rules.include.requireDeal &&
		candidate.openDeals + candidate.wonDeals === 0
	) {
		return false;
	}
	if (rules.include.requireMeeting && candidate.meetings === 0) return false;

	return true;
}

function keywordMatch(title: string | null, keywords: string[]): string | null {
	if (!title) return null;
	const lower = title.toLowerCase();

	return (
		keywords.find((keyword) => lower.includes(keyword.toLowerCase())) ?? null
	);
}

function candidateOf(
	row: Row,
	now: Date,
	rules: WinBackRuleSet,
): ReactivationCandidate {
	const messagesFromThem = Number(row.fromThem);
	const messagesFromUs = Number(row.fromUs);
	const threads = Number(row.threads);
	const meetings = Number(row.meetings);
	const openDeals = Number(row.openDeals);
	const wonDeals = Number(row.wonDeals);
	const quietDays = Math.floor(
		(now.getTime() - row.lastContact.getTime()) / DAY_MS,
	);
	const waitingOnUs =
		row.lastInbound !== null &&
		(row.lastOutbound === null || row.lastInbound > row.lastOutbound);

	const matchedKeyword = keywordMatch(row.title, rules.titleKeywords);
	const hasCompany = Boolean(row.companyId && row.companyName);
	const didBusiness = Number(row.didBusiness ?? 0);
	const openInquiries = Number(row.openInquiries ?? 0);
	const threadsRead = Number(row.threadsRead ?? 0);
	const memoryProducts = row.memoryProducts ?? [];
	const sideNames = memoryProducts.filter((product) =>
		productHits(product, rules.business.sideProducts),
	);
	const mainNames = memoryProducts.filter(
		(product) =>
			productHits(product, rules.business.products) &&
			!productHits(product, rules.business.sideProducts),
	);
	const productMatch = mainNames.length > 0;
	const sideMatch = !productMatch && sideNames.length > 0;
	const boxOnly = isBoxThread(
		{
			relevant: true,
			outcome: "NONE",
			quantityPallets: row.maxPallets,
			unansweredByUs: false,
			products: memoryProducts,
		},
		rules.business.boxProducts,
	);
	const minimum = boxOnly ? rules.business.minBoxes : rules.business.minPallets;
	const bigQuantity =
		row.maxPallets !== null && minimum > 0 && row.maxPallets >= minimum;

	const pointLines: PointLine[] = [];
	const add = (
		label: string,
		points: number,
		vars?: Record<string, string | number>,
	) => {
		if (points > 0) pointLines.push({ label, points, vars });
	};
	const plural = (n: number, one: string, many: string) =>
		n === 1 ? one : many;

	add(
		plural(didBusiness, "{n} deal done before", "{n} deals done before"),
		didBusiness * rules.points.pastBusiness,
		{ n: didBusiness },
	);
	add(
		plural(
			openInquiries,
			"{n} open conversation: an inquiry or offer nobody closed",
			"{n} open conversations: inquiries or offers nobody closed",
		),
		openInquiries * rules.points.openInquiry,
		{ n: openInquiries },
	);
	if (bigQuantity && row.maxPallets !== null) {
		add("Asked about {n} pallets", rules.points.bigQuantity, {
			n: row.maxPallets,
		});
	}
	if (productMatch) {
		add("Talks about {products}", rules.points.productMatch, {
			products: mainNames.slice(0, 3).join(", "),
		});
	}
	if (sideMatch) {
		add("Talks about side ware: {products}", rules.points.sideProductMatch, {
			products: sideNames.slice(0, 3).join(", "),
		});
	}
	if (row.feedback === "good") {
		add("You marked them as worth it", rules.points.goodFeedback);
	}
	if (waitingOnUs) add("Waiting on your reply", rules.points.waitingOnUs);
	add(
		plural(messagesFromThem, "{n} email from them", "{n} emails from them"),
		messagesFromThem * rules.points.perEmailFromThem,
		{ n: messagesFromThem },
	);
	add(
		plural(messagesFromUs, "{n} email from you", "{n} emails from you"),
		messagesFromUs * rules.points.perEmailFromUs,
		{ n: messagesFromUs },
	);
	add(
		plural(meetings, "{n} meeting", "{n} meetings"),
		meetings * rules.points.perMeeting,
		{ n: meetings },
	);
	add(
		plural(openDeals, "{n} open deal", "{n} open deals"),
		openDeals * rules.points.openDeal,
		{ n: openDeals },
	);
	add(
		plural(wonDeals, "{n} won deal", "{n} won deals"),
		wonDeals * rules.points.wonDeal,
		{ n: wonDeals },
	);
	if (hasCompany) add("Has a company", rules.points.hasCompany);
	if (matchedKeyword) {
		add('Title matches "{keyword}"', rules.points.titleKeyword, {
			keyword: matchedKeyword,
		});
	}

	const points = pointLines.reduce((sum, line) => sum + line.points, 0);

	const reasons: string[] = [];

	if (waitingOnUs) {
		reasons.push("Their last message never got a reply from you.");
	} else if (messagesFromUs === 0) {
		reasons.push("They wrote to you and you never replied.");
	}
	if (openDeals > 0) {
		reasons.push(
			openDeals === 1
				? "An open deal is attached to them."
				: `${openDeals} open deals are attached to them.`,
		);
	}
	if (wonDeals > 0) {
		reasons.push(
			wonDeals === 1
				? "You closed a deal with them before."
				: `You closed ${wonDeals} deals with them before.`,
		);
	}
	if (meetings > 0) {
		reasons.push(
			meetings === 1 ? "You met once." : `You met ${meetings} times.`,
		);
	}
	reasons.push(
		`${messagesFromUs + messagesFromThem} emails across ${threads} ${threads === 1 ? "conversation" : "conversations"}, ${messagesFromUs} from you.`,
	);
	reasons.push(`Quiet for ${quietDays} days.`);

	return {
		contact: {
			id: row.id,
			firstName: row.firstName,
			lastName: row.lastName,
			email: row.email,
			title: row.title,
			imageUrl: row.imageUrl,
			company:
				row.companyId && row.companyName
					? { id: row.companyId, name: row.companyName }
					: null,
			owner:
				row.ownerId && row.ownerName
					? { id: row.ownerId, name: row.ownerName }
					: null,
		},
		standing: row.standing,
		potential: row.potentialBand,
		lastContactAt: row.lastContact,
		lastInboundAt: row.lastInbound,
		lastOutboundAt: row.lastOutbound,
		quietDays,
		threads,
		messagesFromThem,
		messagesFromUs,
		meetings,
		openDeals,
		wonDeals,
		lastSubject: row.lastSubject,
		waitingOnUs,
		matchedKeyword,
		memory: {
			summary: row.memorySummary,
			didBusiness,
			openInquiries,
			maxPallets: row.maxPallets,
			products: memoryProducts,
			lastOutcome: row.lastOutcome,
			threadsRead,
		},
		feedback: row.feedback,
		points,
		pointLines,
		reasons,
	};
}

function productHits(product: string, wanted: string[]): boolean {
	const name = product.toLowerCase();
	return wanted.some((term) => name.includes(term.toLowerCase()));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(Math.floor(value), min), max);
}
