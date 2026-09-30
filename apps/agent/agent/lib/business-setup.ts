import { db } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import {
	type MailboxProfile,
	mailboxProfile,
	writeMailboxProfile,
} from "@crm/validation/mailbox-profile";
import {
	DEFAULT_WIN_BACK_RULES,
	readWinBackRules,
	type WinBackRules,
	writeWinBackRules,
	writeWinBackRulesState,
} from "@crm/validation/win-back-rules";
import { streamText } from "ai";
import { z } from "zod";
import { COPY } from "./copy";
import { runFieldProposals } from "./field-proposals";
import { language, say } from "./language";
import { MAILBOX_PROFILE } from "./mailbox-config";
import {
	type CounterpartKinds,
	counterpartKinds,
	currentMailboxProfile,
	type MailboxStats,
	type MailSample,
	mailboxStats,
	mailSample,
	outboundSenders,
	recentThreadIds,
	recordOwnAddresses,
	statsMarkdown,
} from "./mailbox-stats";
import { directModel } from "./model";
import { UNTRUSTED_RULE } from "./untrusted";
import { fetchPage } from "./website-brand";
import { identity, type WorkspaceIdentity } from "./workspace";

export const BUSINESS_SETUP = {
	threadSample: 60,
	bodyChars: 400,
	minThreads: 20,
	maxProducts: 12,
	maxMinimum: 100_000,
	maxList: 50,
} as const;

const trimmed = (max: number) =>
	z
		.string()
		.transform((text) => text.trim().slice(0, max))
		.refine((text) => text.length > 0, "empty");

const clipped = (max: number) =>
	z.string().transform((text) => text.trim().slice(0, max));

const list = (max: number) =>
	z
		.array(trimmed(60))
		.max(BUSINESS_SETUP.maxProducts)
		.transform((entries) => [...new Set(entries)].slice(0, max));

export const businessProposal = z.object({
	description: trimmed(400),
	products: list(BUSINESS_SETUP.maxProducts),
	sideProducts: list(BUSINESS_SETUP.maxProducts),
	boxProducts: list(BUSINESS_SETUP.maxProducts),
	minPallets: z.number().int().min(0).max(BUSINESS_SETUP.maxMinimum),
	minBoxes: z.number().int().min(0).max(BUSINESS_SETUP.maxMinimum),
	unit: trimmed(30),
	note: trimmed(400),
});

export function languageCode(value: string): string | null {
	const [lang = "", region] = value.trim().replace("_", "-").split("-");
	const code = region
		? `${lang.toLowerCase()}-${region.toUpperCase()}`
		: lang.toLowerCase();
	return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(code) ? code : null;
}

const profileBusiness = mailboxProfile.shape.business.shape;

export const profileProposal = z.object({
	side: profileBusiness.side,
	measure: profileBusiness.measure,
	currency: z
		.string()
		.nullable()
		.transform((value) => {
			const code = value?.trim().toUpperCase() ?? "";
			return /^[A-Z]{3}$/.test(code) ? code : null;
		}),
	bulkUnit: z
		.string()
		.nullable()
		.transform((value) => value?.trim().slice(0, 30) || null),
	minAmount: z.number().min(0).nullable(),
	dealMeans: clipped(300),
	counterpartsNote: clipped(300),
	languages: z
		.array(z.string())
		.max(10)
		.transform((codes) =>
			[
				...new Set(
					codes
						.map(languageCode)
						.filter((code): code is string => code !== null),
				),
			].slice(0, 5),
		),
	followUp: z.object({
		toSeller: z.array(z.string()).max(8),
		toBuyer: z.array(z.string()).max(8),
	}),
});

export const mailProposal = businessProposal.extend({
	profile: profileProposal,
});

type ProfileProposal = z.infer<typeof profileProposal>;

export async function sample(): Promise<string> {
	const threads = await db.emailThread.findMany({
		orderBy: { lastMessageAt: "desc" },
		take: BUSINESS_SETUP.threadSample,
		select: {
			subject: true,
			messages: {
				orderBy: { sentAt: "asc" },
				take: 1,
				select: { direction: true, body: true, snippet: true },
			},
		},
	});

	return threads
		.map((thread) => {
			const first = thread.messages[0];
			const text = (first?.body ?? first?.snippet ?? "").slice(
				0,
				BUSINESS_SETUP.bodyChars,
			);
			const who = first?.direction === "OUTBOUND" ? "WE" : "THEY";
			return `- [${who}] ${thread.subject ?? "(no subject)"}\n  ${text}`;
		})
		.join("\n");
}

export function alreadyTuned(description: string): boolean {
	return description.trim() !== DEFAULT_WIN_BACK_RULES.business.description;
}

type Business = WinBackRules["business"];

type Proposal = Omit<z.infer<typeof businessProposal>, "note">;

export function setupSource(
	business: Business,
	threads: number,
): "mail" | "website" | null {
	if (threads >= BUSINESS_SETUP.minThreads) {
		return business.learnedFromMail ? null : "mail";
	}
	return alreadyTuned(business.description) ? null : "website";
}

export function profileDue(
	previous: MailboxProfile | null,
	threads: number,
	kinds: CounterpartKinds,
	now: Date,
): boolean {
	if (!previous) return true;

	const { afterMs, minGapMs, growthFactor } = MAILBOX_PROFILE.rebuild;
	const age = now.getTime() - Date.parse(previous.learnedAt);
	if (age < minGapMs) return false;
	if (age >= afterMs) return true;
	if (threads >= Math.max(previous.basedOnThreads, 1) * growthFactor) {
		return true;
	}

	return (
		kinds.freemail !== previous.counterparts.freemail ||
		kinds.roleAddresses !== previous.counterparts.roleAddresses
	);
}

function added(kept: string[], found: string[], skip: string[] = []): string[] {
	const seen = new Set([...kept, ...skip].map((entry) => entry.toLowerCase()));
	const fresh = found.filter((entry) => !seen.has(entry.toLowerCase()));
	return [...kept, ...fresh].slice(
		0,
		Math.max(kept.length, BUSINESS_SETUP.maxList),
	);
}

export function mergeBusiness(
	current: Business,
	proposal: Proposal,
	fromMail: boolean,
): Business {
	const products = added(current.products, proposal.products);
	return {
		...current,
		description: current.description.trim() || proposal.description,
		products,
		sideProducts: added(current.sideProducts, proposal.sideProducts, products),
		boxProducts: current.boxProducts.length
			? current.boxProducts
			: proposal.boxProducts,
		minPallets: current.minPallets || proposal.minPallets,
		minBoxes: current.minBoxes || proposal.minBoxes,
		unit:
			current.unit === DEFAULT_WIN_BACK_RULES.business.unit
				? proposal.unit
				: current.unit,
		learnedFromMail: current.learnedFromMail || fromMail,
	};
}

const normalised = (text: string) =>
	text.replace(/\s+/g, " ").trim().toLowerCase();

export function quotedFrom(
	sentence: string,
	texts: readonly string[],
): boolean {
	const parts = sentence.split("{product}").map(normalised).filter(Boolean);
	if (parts.join("").length < MAILBOX_PROFILE.followUp.minQuoteChars) {
		return false;
	}

	return texts.some((text) => {
		const haystack = normalised(text);
		let from = 0;
		for (const part of parts) {
			const at = haystack.indexOf(part, from);
			if (at < 0) return false;
			from = at + part.length;
		}
		return true;
	});
}

function quoted(sentences: string[], outbound: readonly string[]): string[] {
	return [
		...new Set(
			sentences
				.map((sentence) => sentence.replace(/\s+/g, " ").trim())
				.filter(
					(sentence) =>
						sentence.length <= 200 && quotedFrom(sentence, outbound),
				),
		),
	].slice(0, MAILBOX_PROFILE.followUp.max);
}

const countsQuantity = (measure: MailboxProfile["business"]["measure"]) =>
	measure !== "money";
const countsMoney = (measure: MailboxProfile["business"]["measure"]) =>
	measure !== "quantity";

export type ProfileInput = {
	proposal: ProfileProposal;
	previous: MailboxProfile | null;
	business: Business;
	stats: MailboxStats;
	threads: number;
	outbound: readonly string[];
	now: Date;
};

export function composeProfile({
	proposal,
	previous,
	business,
	stats,
	threads,
	outbound,
	now,
}: ProfileInput): MailboxProfile {
	const before = previous?.business;
	const quantity =
		countsQuantity(proposal.measure) ||
		(before !== undefined && countsQuantity(before.measure)) ||
		business.minPallets > 0 ||
		stats.insights.quantities > 0 ||
		stats.insights.loads > 0;
	const money =
		countsMoney(proposal.measure) ||
		(before !== undefined && countsMoney(before.measure)) ||
		stats.insights.amounts > 0;
	const toSeller = quoted(proposal.followUp.toSeller, outbound);
	const toBuyer = quoted(proposal.followUp.toBuyer, outbound);

	return {
		v: 1,
		learnedAt: now.toISOString(),
		basedOnThreads: threads,
		business: {
			side: proposal.side,
			measure: quantity && money ? "both" : money ? "money" : "quantity",
			currency: before?.currency ?? proposal.currency,
			bulkUnit: before?.bulkUnit ?? proposal.bulkUnit,
			minAmount: before?.minAmount ?? proposal.minAmount,
			dealMeans: proposal.dealMeans || (before?.dealMeans ?? ""),
		},
		counterparts: {
			...counterpartKinds(stats),
			note: proposal.counterpartsNote,
		},
		languages: proposal.languages.length
			? proposal.languages
			: (previous?.languages ?? []),
		followUp: {
			toSeller: previous?.followUp.toSeller.length
				? previous.followUp.toSeller
				: toSeller,
			toBuyer: previous?.followUp.toBuyer.length
				? previous.followUp.toBuyer
				: toBuyer,
		},
	};
}

type Asked<T> = { ok: true; data: T } | { ok: false; error: string };

async function askProposal<Shape extends z.ZodType>(
	model: Awaited<ReturnType<typeof directModel>>,
	schema: Shape,
	system: string,
	prompt: string,
	check: (data: z.infer<Shape>) => string | null = () => null,
): Promise<Asked<z.infer<Shape>>> {
	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			maxOutputTokens: MAILBOX_PROFILE.model.maxOutputTokens,
			instructions: [
				{ role: "system" as const, content: system },
				...(lastError
					? [
							{
								role: "system" as const,
								content: `Your previous answer was rejected: ${lastError}`,
							},
						]
					: []),
			],
			prompt,
		});

		let text = "";
		for await (const part of result.textStream) text += part;

		const cleaned = text.replace(/```(?:json)?/gi, "").trim();
		const first = cleaned.indexOf("{");
		const last = cleaned.lastIndexOf("}");

		try {
			const parsed = schema.safeParse(
				JSON.parse(cleaned.slice(first, last + 1)),
			);

			if (!parsed.success) {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
					.slice(0, 400);
				continue;
			}

			const refused = check(parsed.data);
			if (refused) {
				lastError = refused;
				continue;
			}

			return { ok: true, data: parsed.data };
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	return { ok: false, error: lastError };
}

function businessLines(): string[] {
	return [
		`description: one or two sentences in ${language()}, naming what they sell or buy and to whom. Write it as the company would, in the first person plural.`,
		"products: the main products or services, as the words that appear in the source. Include the singular form a substring match would catch.",
		"sideProducts: products or services they also offer but value less. Leave it empty when nothing fits.",
		"boxProducts: the words for goods counted in boxes or containers rather than single units. Leave it empty when nothing fits.",
		"minPallets: the smallest quantity that counts as a big order for the main products, counted in unit. minBoxes: the same for box goods. Read real numbers out of the source. Use 0 when the source never names quantities.",
	];
}

function companyLine(us: WorkspaceIdentity | null): string {
	return us
		? `The company: ${us.name}${us.website ? ` (${us.website})` : ""}${us.profile ? `\n${us.profile.narrative.slice(0, 1_200)}` : ""}`
		: "The company did not fill in its own name or website.";
}

async function learnFromWebsite(
	current: WinBackRules,
	threads: number,
	us: WorkspaceIdentity | null,
	buildModel: typeof directModel,
): Promise<string> {
	const page = us?.website ? await fetchPage(us.website) : null;

	if (!page) {
		const note = say(COPY.business.waiting(BUSINESS_SETUP.minThreads, threads));
		await writeWinBackRulesState(db, { note });
		return note;
	}

	const model = await buildModel("reading", "business-setup");
	const system = [
		"You read a company's own mailbox or homepage and work out what they sell, so a CRM can score win-back candidates for them.",
		"Report only what the source shows. Never invent a product line.",
		...businessLines(),
		`unit: the plural word for what minPallets counts, in ${language()} even when the source uses another language, for example the ${language()} word for units, projects, licenses or seats.`,
		`note: one or two ${language()} sentences saying what you concluded and from what.`,
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(businessProposal, { io: "input" })),
	].join("\n");

	const prompt = [
		companyLine(us),
		`The company's own homepage (${page.url.toString()}):\n${page.title ?? ""}\n${page.metaDescription ?? ""}\n${page.text}`,
	].join("\n\n");

	const asked = await askProposal(
		model,
		businessProposal,
		system,
		prompt,
		(data) =>
			data.products.length === 0
				? "products was empty, name at least one"
				: null,
	);

	if (!asked.ok) {
		const note = say(COPY.business.failed(asked.error));
		await writeWinBackRulesState(db, { note });
		return note;
	}

	const { note, ...proposal } = asked.data;
	await writeWinBackRules(db, {
		...current,
		business: mergeBusiness(current.business, proposal, false),
	});
	await writeWinBackRulesState(db, { note, mode: "auto" });

	return note;
}

function knownLines(
	business: Business,
	previous: MailboxProfile | null,
): string {
	const lines = [
		alreadyTuned(business.description)
			? `What the CRM already knows about this business, set by a person or an earlier reading. Keep to it unless the mail clearly shows otherwise:\n${JSON.stringify(
					{
						description: business.description,
						products: business.products,
						unit: business.unit,
						minPallets: business.minPallets,
					},
				)}`
			: "",
		previous
			? `The last mailbox profile:\n${JSON.stringify({
					business: previous.business,
					counterparts: previous.counterparts,
					languages: previous.languages,
				})}`
			: "",
	];
	return lines.filter(Boolean).join("\n\n");
}

export type MailLearnInput = {
	business: Business;
	learnBusiness: boolean;
	previous: MailboxProfile | null;
	stats: MailboxStats;
	sample: MailSample;
	threads: number;
	us: WorkspaceIdentity | null;
	now: Date;
};

export type MailLearned =
	| {
			ok: true;
			profile: MailboxProfile;
			business: Business;
			note: string;
	  }
	| { ok: false; error: string };

export async function learnFromMail(
	input: MailLearnInput,
	model: Awaited<ReturnType<typeof directModel>>,
): Promise<MailLearned> {
	const system = [
		"You read a company's own mailbox and work out what they trade and how their mail works, so a CRM can find win-back candidates and write follow ups for them.",
		"Report only what the source shows. Never invent a product line.",
		UNTRUSTED_RULE,
		...businessLines(),
		`unit: the plural word for what minPallets counts, in ${language()} even when the source uses another language, for example the ${language()} word for pieces, pallets, hours, appointments, projects, licenses or seats.`,
		`note: one or two ${language()} sentences saying what you concluded and from what.`,
		"profile.side: sells, buys, both or unclear, for what this company does with the people it writes with.",
		"profile.measure: how this mailbox sizes an order: quantity (pieces, pallets, hours, loads and similar), money, or both.",
		"profile.currency: the ISO 4217 code of the money the mail names, such as EUR. null when the mail names no money.",
		"profile.bulkUnit: the plural word the mail uses for a bulk load bigger than one unit, such as truck loads or containers, in the mail's language. null when the mail never counts loads.",
		"profile.minAmount: the smallest money amount that counts as a big order here, in currency. null when the mail does not show one.",
		`profile.dealMeans: one ${language()} sentence saying what a finished order or job looks like in this mailbox.`,
		`profile.counterpartsNote: one ${language()} sentence on who the real customers and suppliers are and which kind of address they write from. The statistics count private freemail and role addresses. A role address that writes like a person is a real counterpart.`,
		"profile.languages: the languages of the conversations as codes such as de or en, most used first.",
		"profile.followUp.toSeller: up to 4 sentences we wrote to ask a supplier whether they have the goods again. profile.followUp.toBuyer: up to 4 sentences we wrote to ask a customer whether they need something again. Copy each word for word from the lines marked ours and write {product} where the product name stands. Leave a list empty when our mail has no such sentence. Never write a sentence yourself.",
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(mailProposal, { io: "input" })),
	].join("\n");

	const prompt = [
		companyLine(input.us),
		knownLines(input.business, input.previous),
		statsMarkdown(input.stats),
		input.sample.transcript,
	]
		.filter(Boolean)
		.join("\n\n");

	const asked = await askProposal(
		model,
		mailProposal,
		system,
		prompt,
		(data) =>
			input.learnBusiness && data.products.length === 0
				? "products was empty, name at least one"
				: null,
	);

	if (!asked.ok) return asked;

	const { note, profile, ...proposal } = asked.data;
	const business = input.learnBusiness
		? mergeBusiness(input.business, proposal, true)
		: input.business;

	return {
		ok: true,
		note,
		business,
		profile: composeProfile({
			proposal: profile,
			previous: input.previous,
			business,
			stats: input.stats,
			threads: input.threads,
			outbound: input.sample.outbound,
			now: input.now,
		}),
	};
}

export async function runBusinessSetup(
	buildModel: typeof directModel = directModel,
	now: Date = new Date(),
): Promise<string> {
	const [current, threads, us] = await Promise.all([
		readWinBackRules(db),
		db.emailThread.count(),
		identity(),
	]);
	const from = setupSource(current.business, threads);

	if (threads < BUSINESS_SETUP.minThreads) {
		return from === "website"
			? learnFromWebsite(current, threads, us, buildModel)
			: say(COPY.business.alreadySet);
	}

	const ids = await recentThreadIds();
	const [stats, previous] = await Promise.all([
		mailboxStats(ids),
		currentMailboxProfile(),
	]);
	await recordOwnAddresses(await outboundSenders(ids));

	const learnBusiness = from === "mail";
	if (
		!learnBusiness &&
		!profileDue(previous, threads, counterpartKinds(stats), now)
	) {
		return say(COPY.business.alreadySet);
	}

	const [sampled, model] = await Promise.all([
		mailSample(ids),
		buildModel("reading", "business-setup"),
	]);
	const learned = await learnFromMail(
		{
			business: current.business,
			learnBusiness,
			previous,
			stats,
			sample: sampled,
			threads,
			us,
			now,
		},
		model,
	);

	if (!learned.ok) {
		const note = say(COPY.business.failed(learned.error));
		if (learnBusiness) await writeWinBackRulesState(db, { note });
		return note;
	}

	await writeMailboxProfile(db, learned.profile);
	if (!learnBusiness) return learned.note;

	await writeWinBackRules(db, { ...current, business: learned.business });
	await writeWinBackRulesState(db, { note: learned.note, mode: "auto" });

	return `${learned.note} ${await runFieldProposals(sampled.transcript, buildModel)}`;
}
