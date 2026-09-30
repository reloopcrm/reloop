import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type EmailDirection, Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import {
	type MailboxProfile,
	readMailboxProfile,
	writeMailboxProfile,
} from "@crm/validation/mailbox-profile";
import {
	readWinBackRules,
	writeWinBackRules,
} from "@crm/validation/win-back-rules";
import { simulateReadableStream } from "ai";
import { runBusinessSetup } from "../agent/lib/business-setup";
import { COPY } from "../agent/lib/copy";
import { say } from "../agent/lib/language";
import {
	counterpartKinds,
	mailboxStats,
	mailSample,
	outboundSenders,
	recordOwnAddresses,
} from "../agent/lib/mailbox-stats";
import type { directModel } from "../agent/lib/model";

const suffix = process.env.TEST_RUN_ID ?? "mailbox-stats-spec";
const own = `meister.${suffix}@handwerk.example.com`;

type Seed = {
	subject: string;
	from: string;
	body: string;
	reply?: string;
	insight?: { relevant: boolean; quantityPallets?: number; loads?: number };
};

let savedSetting: Awaited<ReturnType<typeof db.appSetting.findUnique>> | null =
	null;
let counter = 0;

async function seed(rows: Seed[]): Promise<string[]> {
	const ids: string[] = [];
	for (const row of rows) {
		counter += 1;
		const at = new Date(Date.UTC(2026, 8, 1, 8, counter));
		const later = new Date(at.getTime() + 60_000);
		const message = (
			n: number,
			direction: EmailDirection,
			fromEmail: string,
			body: string,
			sentAt: Date,
		) => ({
			rfcMessageId: `msg-${suffix}-${counter}-${n}`,
			direction,
			fromEmail,
			recipients: [],
			subject: row.subject,
			body,
			sentAt,
		});

		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${suffix}-${counter}`,
				subject: row.subject,
				firstMessageAt: at,
				lastMessageAt: row.reply ? later : at,
				messageCount: row.reply ? 2 : 1,
				messages: {
					create: [
						message(1, "INBOUND", row.from, row.body, at),
						...(row.reply
							? [message(2, "OUTBOUND", own, row.reply, later)]
							: []),
					],
				},
				...(row.insight && {
					insight: {
						create: {
							relevant: row.insight.relevant,
							topics: [],
							products: [],
							quantityPallets: row.insight.quantityPallets ?? null,
							loads: row.insight.loads ?? null,
							outcome: "OTHER",
							summary: "",
							evidence: [],
							modelId: "test",
							lastMessageAt: at,
						},
					},
				}),
			},
			select: { id: true },
		});
		ids.push(thread.id);
	}
	return ids;
}

async function clean(): Promise<void> {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { startsWith: `root-${suffix}-` } },
	});
}

let tradesman: string[] = [];
let trade: string[] = [];

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
	await clean();

	tradesman = await seed([
		{
			subject: "Heizung tropft",
			from: `maria.beispiel.${suffix}@gmx.de`,
			body: "Hallo, unsere Heizung tropft. Können Sie kommen?",
			reply: "Guten Tag Frau Beispiel, wir kommen am Dienstag, etwa 2 Stunden.",
		},
		{
			subject: "Wartung",
			from: `max.muster.${suffix}@gmail.com`,
			body: "Wann ist die nächste Wartung fällig?",
			reply: "Brauchen Sie wieder einen Termin für die Heizungswartung?",
		},
		{
			subject: "Badsanierung",
			from: `erika.probe.${suffix}@web.de`,
			body: "Wir möchten das Bad erneuern.",
			reply: "Gern, wir rechnen mit 40 Stunden.",
		},
		{
			subject: "Rückfrage Hausverwaltung",
			from: `info@verwaltung-${suffix}.example.com`,
			body: "Bitte schicken Sie uns einen Termin für Haus 3.",
			reply: "Wir kommen am Freitag.",
		},
		{
			subject: "Angebot Heizungstausch",
			from: `anna.kunde@firma-${suffix}.example.com`,
			body: "Bitte ein Angebot für den Heizungstausch.",
			reply: "Anbei das Angebot, 16 Stunden Arbeit.",
		},
		{
			subject: "Termin Büro",
			from: `ben.kunde@firma2-${suffix}.example.com`,
			body: "Passt Montag?",
			reply: "Montag passt.",
		},
		{
			subject: "Neue Anfrage Dachrinne",
			from: `lena.test.${suffix}@gmx.de`,
			body: "Können Sie die Dachrinne reinigen?",
		},
		{
			subject: "Newsletter September",
			from: `news@shop-${suffix}.example.com`,
			body: "Unsere Angebote im September.",
			insight: { relevant: false },
		},
	]);

	trade = await seed([
		...Array.from({ length: 4 }, (_, n) => ({
			subject: `Europaletten ${n}`,
			from: `jan.handel${n}@palette-${suffix}.example.com`,
			body: "Wir haben 30 Europaletten zur Abholung.",
			reply: "Wir holen 2 LKW-Ladungen ab.",
			insight: { relevant: true, quantityPallets: 30, loads: 2 },
		})),
		{
			subject: "Privat",
			from: `privat.${suffix}@gmail.com`,
			body: "Haben Sie drei Paletten für meinen Garten?",
		},
	]);

	await seed(
		Array.from({ length: 20 }, (_, n) => ({
			subject: `Rundschreiben ${n}`,
			from: `rundschreiben@verband-${suffix}.example.com`,
			body: "Mitteilung an alle Mitglieder.",
			insight: { relevant: false },
		})),
	);
});

afterAll(async () => {
	await clean();
	if (savedSetting) {
		await db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: {
				ownAddresses: savedSetting.ownAddresses,
				winBackRules: savedSetting.winBackRules ?? Prisma.DbNull,
				mailboxProfile: savedSetting.mailboxProfile ?? Prisma.DbNull,
			},
		});
	} else {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	}
});

describe("mailbox statistics", () => {
	it("counts freemail, role and work senders, and whom we answered", async () => {
		const stats = await mailboxStats(tradesman);

		expect(stats.threads).toBe(8);
		expect(stats.outboundThreads).toBe(6);
		expect(stats.senders.freemail).toEqual({ senders: 4, answered: 3 });
		expect(stats.senders.role).toEqual({ senders: 1, answered: 1 });
		expect(stats.senders.work).toEqual({ senders: 3, answered: 2 });
		expect(counterpartKinds(stats)).toEqual({
			freemail: "common",
			roleAddresses: "rare",
		});
	});

	it("sees a trader's customers on company domains, with quantities and loads", async () => {
		const stats = await mailboxStats(trade);

		expect(counterpartKinds(stats).freemail).toBe("rare");
		expect(stats.insights).toEqual({ quantities: 4, loads: 4, amounts: 0 });
	});
});

describe("the sample the model reads", () => {
	it("shows our sent mail first, sender kinds, and no address", async () => {
		const sampled = await mailSample(tradesman);

		expect(sampled.outbound).toHaveLength(6);
		expect(sampled.transcript).toContain("counterpart: freemail");
		expect(sampled.transcript).toContain("sender: freemail");
		expect(sampled.transcript).not.toContain("Newsletter September");
		expect(sampled.transcript).not.toContain("@");
		expect(sampled.transcript.indexOf("WE REPLIED")).toBeLessThan(
			sampled.transcript.indexOf("THEY WROTE"),
		);
	});
});

describe("the firm's own addresses", () => {
	it("are the addresses our sent mail came from", async () => {
		expect(await outboundSenders(tradesman)).toEqual([own]);
	});

	it("are appended once and never removed", async () => {
		const kept = `kept.${suffix}@handwerk.example.com`;
		await db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, ownAddresses: [kept] },
			update: { ownAddresses: [kept] },
		});

		const alias = `alias.${suffix}@handwerk.example.com`;
		await Promise.all([
			recordOwnAddresses([own, kept]),
			recordOwnAddresses([alias]),
		]);
		await recordOwnAddresses([own]);

		const row = await db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { ownAddresses: true },
		});
		expect(row?.ownAddresses[0]).toBe(kept);
		expect([...(row?.ownAddresses ?? [])].sort()).toEqual(
			[kept, own, alias].sort(),
		);
	});
});

function garbageModel() {
	let calls = 0;
	const model = {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doStream: async () => {
			calls += 1;
			return {
				stream: simulateReadableStream({
					initialDelayInMs: 0,
					chunkDelayInMs: 0,
					chunks: [
						{ type: "text-start", id: "1" },
						{ type: "text-delta", id: "1", delta: "no json" },
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
	return { model: model as never, calls: () => calls };
}

function profileLearned(daysAgo: number): MailboxProfile {
	return {
		v: 1,
		learnedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
		basedOnThreads: 1_000_000,
		business: {
			side: "both",
			measure: "quantity",
			currency: "EUR",
			bulkUnit: "LKW-Ladungen",
			minAmount: null,
			dealMeans: "Eine Abholung ist vereinbart.",
		},
		counterparts: {
			freemail: "rare",
			roleAddresses: "rare",
			note: "Firmen schreiben von ihren eigenen Domains.",
		},
		languages: ["de"],
		followUp: { toSeller: ["Haben Sie wieder {product}?"], toBuyer: [] },
	};
}

describe("a run of the business setup", () => {
	beforeAll(async () => {
		await writeWinBackRules(db, {
			...DEFAULT_WIN_BACK_RULES,
			business: {
				...DEFAULT_WIN_BACK_RULES.business,
				description: "Wir kaufen und verkaufen Europaletten.",
				products: ["Europalette"],
				unit: "Paletten",
				minPallets: 20,
				learnedFromMail: true,
			},
		});
	});

	it("asks no model while the profile is fresh", async () => {
		const previous = await writeMailboxProfile(db, profileLearned(1));
		let built = 0;
		const build = (async () => {
			built += 1;
			return garbageModel().model;
		}) as typeof directModel;

		expect(await runBusinessSetup(build)).toBe(say(COPY.business.alreadySet));
		expect(built).toBe(0);
		expect(await readMailboxProfile(db)).toEqual({
			ok: true,
			profile: previous,
		});
	});

	it("leaves the old profile and the rules untouched when the model answers garbage", async () => {
		const previous = await writeMailboxProfile(db, profileLearned(100));
		const rules = await readWinBackRules(db);
		const stub = garbageModel();

		const note = await runBusinessSetup(async () => stub.model);

		expect(stub.calls()).toBeGreaterThan(0);
		expect(note).toStartWith(say(COPY.business.failed("")).trim());
		expect(await readMailboxProfile(db)).toEqual({
			ok: true,
			profile: previous,
		});
		expect(await readWinBackRules(db)).toEqual(rules);
	});

	it("leaves the old profile untouched when no model can be built", async () => {
		const previous = await writeMailboxProfile(db, profileLearned(100));

		await expect(
			runBusinessSetup(async () => {
				throw new Error("no model provider is configured here");
			}),
		).rejects.toThrow("no model provider");
		expect(await readMailboxProfile(db)).toEqual({
			ok: true,
			profile: previous,
		});
	});
});
