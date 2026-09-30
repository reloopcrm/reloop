import { describe, expect, it } from "bun:test";
import { MEMORY } from "@crm/db/insights";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import {
	type MailboxProfile,
	mailboxProfile,
} from "@crm/validation/mailbox-profile";
import { simulateReadableStream } from "ai";
import { z } from "zod";
import {
	alreadyTuned,
	BUSINESS_SETUP,
	businessProposal,
	composeProfile,
	languageCode,
	learnFromMail,
	type MailLearnInput,
	mergeBusiness,
	profileDue,
	profileProposal,
	quotedFrom,
	setupSource,
} from "../agent/lib/business-setup";
import { MAILBOX_PROFILE } from "../agent/lib/mailbox-config";
import type {
	CounterpartKinds,
	MailboxStats,
	MailSample,
} from "../agent/lib/mailbox-stats";

describe("deciding whether the business rules still need finding", () => {
	it("sees the untouched default as not yet set", () => {
		expect(alreadyTuned(DEFAULT_WIN_BACK_RULES.business.description)).toBe(
			false,
		);
	});

	it("ignores padding around the default", () => {
		expect(
			alreadyTuned(`  ${DEFAULT_WIN_BACK_RULES.business.description}  `),
		).toBe(false);
	});

	it("sees anything a customer would have as set", () => {
		for (const description of [
			"Wir handeln mit Baustahl und Betonmatten.",
			"We buy and sell used forklifts.",
			"Wir kaufen und verkaufen Europaletten.",
		]) {
			expect(alreadyTuned(description)).toBe(true);
		}
	});
});

describe("reading a proposal for any business", () => {
	it("accepts a software agency", () => {
		const parsed = businessProposal.safeParse({
			description: "We build web and mobile apps for mid sized companies.",
			products: ["web app", "mobile app", "web app"],
			sideProducts: ["hosting"],
			boxProducts: [],
			minPallets: 1,
			minBoxes: 0,
			unit: "projects",
			note: "Read from the services page.",
		});

		expect(parsed.success).toBe(true);
		expect(parsed.data?.products).toEqual(["web app", "mobile app"]);
		expect(parsed.data?.unit).toBe("projects");
	});

	it("refuses a proposal without a description", () => {
		expect(
			businessProposal.safeParse({
				description: "  ",
				products: ["consulting"],
				sideProducts: [],
				boxProducts: [],
				minPallets: 0,
				minBoxes: 0,
				unit: "projects",
				note: "Nothing.",
			}).success,
		).toBe(false);
	});
});

describe("the schema the prompt shows the model", () => {
	it("builds from the proposal shape, transforms and all", () => {
		const json = z.toJSONSchema(businessProposal, { io: "input" }) as {
			properties: Record<string, { type?: string }>;
		};

		expect(json.properties.description?.type).toBe("string");
		expect(json.properties.products?.type).toBe("array");
		expect(json.properties.minPallets?.type).toBe("integer");
	});
});

describe("the setup limits", () => {
	it("waits for enough mail before it guesses", () => {
		expect(BUSINESS_SETUP.minThreads).toBeGreaterThanOrEqual(10);
		expect(BUSINESS_SETUP.threadSample).toBeGreaterThanOrEqual(
			BUSINESS_SETUP.minThreads,
		);
	});

	it("keeps the sample small enough to stay cheap", () => {
		const chars = BUSINESS_SETUP.threadSample * BUSINESS_SETUP.bodyChars;
		expect(chars).toBeLessThanOrEqual(40_000);
	});
});

const proposal = {
	description: "We build web apps.",
	products: ["Web app", "Mobile app"],
	sideProducts: ["Hosting", "web app"],
	boxProducts: [],
	minPallets: 2,
	minBoxes: 0,
	unit: "projects",
};

const set = {
	...DEFAULT_WIN_BACK_RULES.business,
	description: "We sell design work.",
	products: ["web app", "Logo"],
	sideProducts: ["Print"],
	minPallets: 5,
	unit: "orders",
};

describe("learning the business from mail after onboarding", () => {
	it("adds missing products and side products", () => {
		const merged = mergeBusiness(set, proposal, true);

		expect(merged.products).toEqual(["web app", "Logo", "Mobile app"]);
		expect(merged.sideProducts).toEqual(["Print", "Hosting"]);
	});

	it("never overwrites a value that is set", () => {
		const merged = mergeBusiness(set, proposal, true);

		expect(merged.description).toBe("We sell design work.");
		expect(merged.minPallets).toBe(5);
		expect(merged.unit).toBe("orders");
		expect(merged.products.slice(0, 2)).toEqual(set.products);
		expect(merged.sideProducts[0]).toBe("Print");
	});

	it("fills a minimum and unit that are still the default", () => {
		const merged = mergeBusiness(
			{ ...set, minPallets: 0, unit: "units" },
			proposal,
			true,
		);

		expect(merged.minPallets).toBe(2);
		expect(merged.unit).toBe("projects");
	});

	it("runs the mail pass only once", () => {
		const enough = BUSINESS_SETUP.minThreads;

		expect(setupSource(set, enough)).toBe("mail");
		const learned = mergeBusiness(set, proposal, true);
		expect(learned.learnedFromMail).toBe(true);
		expect(setupSource(learned, enough)).toBeNull();
	});

	it("reads the website only while nothing is set and mail is thin", () => {
		expect(setupSource(DEFAULT_WIN_BACK_RULES.business, 0)).toBe("website");
		expect(setupSource(set, 0)).toBeNull();
		expect(
			mergeBusiness(DEFAULT_WIN_BACK_RULES.business, proposal, false)
				.learnedFromMail,
		).toBe(false);
	});
});

function answering(answers: string[]) {
	const calls: { prompt: unknown; maxOutputTokens?: number }[] = [];

	const model = {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doStream: async (options: {
			prompt: unknown;
			maxOutputTokens?: number;
		}) => {
			calls.push(options);
			const text = answers[calls.length - 1] ?? answers[answers.length - 1];

			return {
				stream: simulateReadableStream({
					initialDelayInMs: 0,
					chunkDelayInMs: 0,
					chunks: [
						{ type: "text-start", id: "1" },
						{ type: "text-delta", id: "1", delta: text },
						{ type: "text-end", id: "1" },
						{
							type: "finish",
							finishReason: "stop",
							usage: {
								inputTokens: { total: 0 },
								outputTokens: { total: 0 },
							},
						},
					],
				}),
			};
		},
	};

	return { model: model as never, calls };
}

const NOW = new Date("2026-09-30T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(NOW.getTime() - days * 24 * 60 * 60 * 1_000).toISOString();

function statsWith(
	senders: MailboxStats["senders"],
	insights: MailboxStats["insights"] = { quantities: 0, loads: 0, amounts: 0 },
): MailboxStats {
	return { threads: 40, outboundThreads: 20, senders, insights };
}

const tradesmanStats = statsWith({
	freemail: { senders: 4, answered: 3 },
	role: { senders: 1, answered: 1 },
	work: { senders: 2, answered: 2 },
});

const tradeStats = statsWith(
	{
		freemail: { senders: 1, answered: 0 },
		role: { senders: 1, answered: 0 },
		work: { senders: 6, answered: 5 },
	},
	{ quantities: 9, loads: 3, amounts: 0 },
);

const tradesmanSample: MailSample = {
	transcript:
		"- [WE REPLIED | counterpart: freemail] Heizung\n  ours: Guten Tag Frau Beispiel, brauchen Sie wieder einen Termin für die Heizungswartung? Wir berechnen 3 Stunden.",
	outbound: [
		"Guten Tag Frau Beispiel, brauchen Sie wieder einen Termin für die Heizungswartung? Wir berechnen 3 Stunden.",
	],
};

const tradeSample: MailSample = {
	transcript:
		"- [WE WROTE FIRST | counterpart: work] Europaletten\n  ours: Haben Sie wieder Europaletten zur Abholung? Wir nehmen 2 LKW-Ladungen.",
	outbound: [
		"Haben Sie wieder Europaletten zur Abholung? Wir nehmen 2 LKW-Ladungen.",
	],
};

function answer(
	profile: Partial<z.input<typeof profileProposal>>,
	business: Partial<z.input<typeof businessProposal>> = {},
) {
	return JSON.stringify({
		description: "Wir warten Heizungen für Privatkunden.",
		products: ["Heizungswartung"],
		sideProducts: [],
		boxProducts: [],
		minPallets: 0,
		minBoxes: 0,
		unit: "Stunden",
		note: "Aus den gesendeten Mails gelesen.",
		...business,
		profile: {
			side: "sells",
			measure: "quantity",
			currency: "eur",
			bulkUnit: null,
			minAmount: null,
			dealMeans: "Ein Termin ist vereinbart und die Rechnung ist raus.",
			counterpartsNote: "Privatkunden schreiben von gmx und gmail.",
			languages: ["de", "DE", "xx-invalid-code"],
			followUp: { toSeller: [], toBuyer: [] },
			...profile,
		},
	});
}

function input(
	stats: MailboxStats,
	sampled: MailSample,
	extra: Partial<MailLearnInput> = {},
): MailLearnInput {
	return {
		business: DEFAULT_WIN_BACK_RULES.business,
		learnBusiness: true,
		previous: null,
		stats,
		sample: sampled,
		threads: 40,
		us: null,
		now: NOW,
		...extra,
	};
}

describe("learning a mailbox profile", () => {
	it("gives a tradesman freemail counterparts and hours", async () => {
		const { model } = answering([
			answer({
				followUp: {
					toSeller: [],
					toBuyer: [
						"Brauchen Sie wieder einen Termin für {product}?",
						"Dürfen wir Ihnen ein neues Angebot schicken?",
					],
				},
			}),
		]);

		const learned = await learnFromMail(
			input(tradesmanStats, tradesmanSample),
			model,
		);

		expect(learned.ok).toBe(true);
		if (!learned.ok) return;
		expect(mailboxProfile.safeParse(learned.profile).success).toBe(true);
		expect(learned.profile.counterparts.freemail).toBe("common");
		expect(learned.profile.counterparts.roleAddresses).toBe("rare");
		expect(learned.profile.business.measure).toBe("quantity");
		expect(learned.profile.business.currency).toBe("EUR");
		expect(learned.profile.languages).toEqual(["de"]);
		expect(learned.business.unit).toBe("Stunden");
		expect(learned.profile.followUp.toBuyer).toEqual([
			"Brauchen Sie wieder einen Termin für {product}?",
		]);
	});

	it("gives a trader pallets and loads, and keeps the quantity the old rules count", async () => {
		const { model } = answering([
			answer(
				{ side: "both", measure: "money", bulkUnit: "LKW-Ladungen" },
				{ products: ["Europalette"], unit: "Paletten", minPallets: 0 },
			),
		]);

		const learned = await learnFromMail(
			input(tradeStats, tradeSample, {
				business: {
					...DEFAULT_WIN_BACK_RULES.business,
					description: "Wir kaufen und verkaufen Europaletten.",
					products: ["Europalette"],
					unit: "Paletten",
					minPallets: 20,
					learnedFromMail: true,
				},
				learnBusiness: false,
			}),
			model,
		);

		expect(learned.ok).toBe(true);
		if (!learned.ok) return;
		expect(learned.profile.business.bulkUnit).toBe("LKW-Ladungen");
		expect(learned.profile.business.measure).toBe("both");
		expect(learned.profile.counterparts.freemail).toBe("rare");
		expect(learned.business.unit).toBe("Paletten");
		expect(learned.business.minPallets).toBe(20);
		expect(learned.business.products).toEqual(["Europalette"]);
	});

	it("reports a model that never answers in shape", async () => {
		const { model, calls } = answering(["not json at all", '{"profile":1}']);

		const learned = await learnFromMail(
			input(tradesmanStats, tradesmanSample),
			model,
		);

		expect(learned.ok).toBe(false);
		expect(calls).toHaveLength(MEMORY.jsonAttempts);
	});

	it("bounds the length of every answer", async () => {
		const { model, calls } = answering([answer({})]);

		await learnFromMail(input(tradesmanStats, tradesmanSample), model);

		expect(calls[0]?.maxOutputTokens).toBe(
			MAILBOX_PROFILE.model.maxOutputTokens,
		);
	});

	it("keeps follow up sentences and a bulk unit that are already set", async () => {
		const previous = composeProfile({
			proposal: profileProposal.parse(
				JSON.parse(answer({ bulkUnit: "LKW-Ladungen" })).profile,
			),
			previous: null,
			business: DEFAULT_WIN_BACK_RULES.business,
			stats: tradeStats,
			threads: 40,
			outbound: [],
			now: NOW,
		});
		const seeded = {
			...previous,
			followUp: { toSeller: ["Haben Sie wieder {product}?"], toBuyer: [] },
		};

		const { model } = answering([
			answer({
				bulkUnit: null,
				followUp: {
					toSeller: ["Haben Sie wieder {product} zur Abholung?"],
					toBuyer: [],
				},
			}),
		]);
		const learned = await learnFromMail(
			input(tradeStats, tradeSample, { previous: seeded }),
			model,
		);

		expect(learned.ok).toBe(true);
		if (!learned.ok) return;
		expect(learned.profile.followUp.toSeller).toEqual([
			"Haben Sie wieder {product}?",
		]);
		expect(learned.profile.business.bulkUnit).toBe("LKW-Ladungen");
	});
});

describe("when the mailbox profile is built again", () => {
	const kinds = { freemail: "common", roleAddresses: "rare" } as const;
	const profile = (learnedAt: string, basedOnThreads = 40): MailboxProfile => ({
		v: 1,
		learnedAt,
		basedOnThreads,
		business: {
			side: "sells",
			measure: "quantity",
			currency: null,
			bulkUnit: null,
			minAmount: null,
			dealMeans: "",
		},
		counterparts: { ...kinds, note: "" },
		languages: ["de"],
		followUp: { toSeller: [], toBuyer: [] },
	});

	const rows: [
		string,
		MailboxProfile | null,
		number,
		CounterpartKinds,
		boolean,
	][] = [
		["no profile", null, 40, kinds, true],
		["learned 3 days ago", profile(daysAgo(3)), 400, kinds, false],
		[
			"learned 3 days ago, behaviour changed",
			profile(daysAgo(3)),
			40,
			{ ...kinds, freemail: "rare" },
			false,
		],
		[
			"learned 8 days ago, nothing changed",
			profile(daysAgo(8)),
			60,
			kinds,
			false,
		],
		[
			"learned 8 days ago, threads doubled",
			profile(daysAgo(8)),
			80,
			kinds,
			true,
		],
		[
			"learned 8 days ago, behaviour changed",
			profile(daysAgo(8)),
			40,
			{ ...kinds, roleAddresses: "common" },
			true,
		],
		["learned 91 days ago", profile(daysAgo(91)), 40, kinds, true],
	];

	for (const [name, previous, threads, now, due] of rows) {
		it(name, () => {
			expect(profileDue(previous, threads, now, NOW)).toBe(due);
		});
	}
});

describe("a follow up sentence must come from our own mail", () => {
	const ours = [
		"Hallo Herr Beispiel,\nhaben Sie wieder  Europaletten zur Abholung? Gruß",
	];

	it("accepts a quote with the product swapped for a placeholder", () => {
		expect(quotedFrom("Haben Sie wieder {product} zur Abholung?", ours)).toBe(
			true,
		);
	});

	it("refuses a sentence nobody wrote", () => {
		expect(quotedFrom("Brauchen Sie wieder {product}?", ours)).toBe(false);
	});

	it("refuses a quote too short to mean anything", () => {
		expect(quotedFrom("{product}?", ours)).toBe(false);
	});
});

describe("the profile limits", () => {
	it("keeps one build to one small reading call", () => {
		const { sample: size, model } = MAILBOX_PROFILE;
		const threads =
			size.sent +
			size.received.freemail +
			size.received.role +
			size.received.work;

		expect(
			threads * (size.excerptChars + size.subjectChars),
		).toBeLessThanOrEqual(40_000);
		expect(model.maxOutputTokens).toBeLessThanOrEqual(2_000);
		expect(MEMORY.jsonAttempts).toBeLessThanOrEqual(2);
	});

	it("never builds more often than once a week", () => {
		expect(MAILBOX_PROFILE.rebuild.minGapMs).toBeGreaterThanOrEqual(
			7 * 24 * 60 * 60 * 1_000,
		);
	});

	it("reads language codes the way the profile stores them", () => {
		expect(languageCode("de_de")).toBe("de-DE");
		expect(languageCode("EN")).toBe("en");
		expect(languageCode("deutsch")).toBeNull();
	});
});
