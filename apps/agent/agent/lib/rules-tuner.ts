import { db } from "@crm/db";
import {
	MEMORY,
	POTENTIAL_VERDICT,
	type PotentialVerdict,
} from "@crm/db/insights";
import {
	readWinBackRules,
	type WinBackRules,
	winBackRules,
	writeWinBackRules,
	writeWinBackRulesState,
} from "@crm/validation/win-back-rules";
import { streamText } from "ai";
import { z } from "zod";
import { language, say } from "./language";
import { directModel } from "./model";
import { playbookPrompt, readPlaybook } from "./playbook";

const TUNER = {
	examplesPerVerdict: 20,
	noteMaxChars: 600,
	minGoodExamples: 1,
	minBadExamples: 1,
} as const;

const proposalSchema = z.object({
	rules: winBackRules,
	note: z.string().max(TUNER.noteMaxChars),
});

export type VerdictExample = {
	name: string;
	verdict: PotentialVerdict;
	title: string | null;
	company: string | null;
	memory: string | null;
	didBusiness: number;
	openInquiries: number;
	maxPallets: number | null;
	products: string[];
};

async function examplesFor(
	verdict: PotentialVerdict,
): Promise<VerdictExample[]> {
	const rows = await db.potentialFeedback.findMany({
		where: { verdict },
		orderBy: { updatedAt: "desc" },
		take: TUNER.examplesPerVerdict,
		select: {
			contact: {
				select: {
					firstName: true,
					lastName: true,
					title: true,
					company: { select: { name: true } },
					memory: {
						select: {
							summary: true,
							didBusiness: true,
							openInquiries: true,
							maxPallets: true,
							products: true,
						},
					},
				},
			},
		},
	});

	return rows.map((row) => ({
		name: [row.contact.firstName, row.contact.lastName]
			.filter(Boolean)
			.join(" "),
		verdict,
		title: row.contact.title,
		company: row.contact.company?.name ?? null,
		memory: row.contact.memory?.summary ?? null,
		didBusiness: row.contact.memory?.didBusiness ?? 0,
		openInquiries: row.contact.memory?.openInquiries ?? 0,
		maxPallets: row.contact.memory?.maxPallets ?? null,
		products: row.contact.memory?.products ?? [],
	}));
}

export async function verdictExamples(): Promise<VerdictExample[]> {
	const [good, bad] = await Promise.all([
		examplesFor(POTENTIAL_VERDICT.good),
		examplesFor(POTENTIAL_VERDICT.bad),
	]);

	return [...good, ...bad];
}

async function landscape(minimum: number): Promise<Record<string, number>> {
	const [contacts, withMemory, deals, inquiries, bigOrders] = await Promise.all(
		[
			db.contact.count({ where: { archivedAt: null } }),
			db.contactMemory.count(),
			db.contactMemory.count({ where: { didBusiness: { gt: 0 } } }),
			db.contactMemory.count({ where: { openInquiries: { gt: 0 } } }),
			db.contactMemory.count({ where: { maxPallets: { gte: minimum } } }),
		],
	);

	return { contacts, withMemory, deals, inquiries, bigOrders };
}

export function rankable(points: WinBackRules["points"]): boolean {
	return Object.values(points).some((value) => value > 0);
}

function goodLabel(): string {
	return say({
		en: "Worth it",
		de: "Lohnt sich",
		es: "Interesante",
		fr: "Intéressant",
		"pt-BR": "Vale a pena",
		tr: "Değer",
		"zh-Hans": "值得",
	});
}

function badLabel(): string {
	return say({
		en: "Not for us",
		de: "Nichts für uns",
		es: "No es para nosotros",
		fr: "Pas pour nous",
		"pt-BR": "Não é para nós",
		tr: "Bize göre değil",
		"zh-Hans": "不适合我们",
	});
}

function seenVerdicts(count: number, label: string): string {
	return count === 1
		? say({
				en: `I see 1 verdict, and it says "${label}".`,
				de: `Ich sehe 1 Urteil, und es sagt "${label}".`,
				es: `Veo 1 valoración, y dice "${label}".`,
				fr: `Je vois 1 avis, et il dit "${label}".`,
				"pt-BR": `Vejo 1 avaliação, e ela diz "${label}".`,
				tr: `1 değerlendirme görüyorum ve "${label}" diyor.`,
				"zh-Hans": `我看到 1 条评价，它是"${label}"。`,
			})
		: say({
				en: `I see ${count} verdicts, and all of them say "${label}".`,
				de: `Ich sehe ${count} Urteile, und alle sagen "${label}".`,
				es: `Veo ${count} valoraciones, y todas dicen "${label}".`,
				fr: `Je vois ${count} avis, et tous disent "${label}".`,
				"pt-BR": `Vejo ${count} avaliações, e todas dizem "${label}".`,
				tr: `${count} değerlendirme görüyorum ve hepsi "${label}" diyor.`,
				"zh-Hans": `我看到 ${count} 条评价，全部是"${label}"。`,
			});
}

function atLeastPeople(count: number): string {
	return count === 1
		? say({
				en: "at least one person",
				de: "mindestens eine Person",
				es: "al menos una persona",
				fr: "au moins une personne",
				"pt-BR": "pelo menos uma pessoa",
				tr: "en az bir kişi",
				"zh-Hans": "至少一个人",
			})
		: say({
				en: `at least ${count} people`,
				de: `mindestens ${count} Personen`,
				es: `al menos ${count} personas`,
				fr: `au moins ${count} personnes`,
				"pt-BR": `pelo menos ${count} pessoas`,
				tr: `en az ${count} kişi`,
				"zh-Hans": `至少 ${count} 个人`,
			});
}

export type VerdictCounts = { good: number; bad: number };

export async function verdictCounts(): Promise<VerdictCounts> {
	const [good, bad] = await Promise.all([
		db.potentialFeedback.count({ where: { verdict: POTENTIAL_VERDICT.good } }),
		db.potentialFeedback.count({ where: { verdict: POTENTIAL_VERDICT.bad } }),
	]);

	return { good, bad };
}

export function oneSidedReason(counts: VerdictCounts): string | null {
	const { good, bad } = counts;
	const [goodName, badName] = [goodLabel(), badLabel()];

	if (good < TUNER.minGoodExamples && bad < TUNER.minBadExamples) {
		return say({
			en: `I did not change the rules. There is no verdict yet. In Win-back, first mark people as "${goodName}" or "${badName}".`,
			de: `Ich habe die Regeln nicht angepasst. Es gibt noch kein Urteil. Markiere in Zurückgewinnen zuerst Personen mit "${goodName}" oder "${badName}".`,
			es: `No he cambiado las reglas. Todavía no hay ninguna valoración. En Recuperar, marca primero personas como "${goodName}" o "${badName}".`,
			fr: `Je n'ai pas modifié les règles. Il n'y a encore aucun avis. Dans Reconquête, marque d'abord des personnes comme "${goodName}" ou "${badName}".`,
			"pt-BR": `Não mudei as regras. Ainda não há nenhuma avaliação. Em Reconquistar, marque primeiro pessoas como "${goodName}" ou "${badName}".`,
			tr: `Kuralları değiştirmedim. Henüz hiç değerlendirme yok. Geri kazan bölümünde önce kişileri "${goodName}" veya "${badName}" olarak işaretle.`,
			"zh-Hans": `我没有修改规则。目前还没有任何评价。请先在赢回中把人标记为"${goodName}"或"${badName}"。`,
		});
	}

	if (good < TUNER.minGoodExamples) {
		const seen = seenVerdicts(bad, badName);
		const needed = atLeastPeople(TUNER.minGoodExamples);
		return say({
			en: `I did not change the rules. ${seen} I need ${needed} marked "${goodName}". Then I learn what a good contact looks like.`,
			de: `Ich habe die Regeln nicht angepasst. ${seen} Ich brauche ${needed} mit "${goodName}". Dann lerne ich, wie ein guter Kontakt aussieht.`,
			es: `No he cambiado las reglas. ${seen} Necesito ${needed} marcadas como "${goodName}". Así aprendo cómo es un buen contacto.`,
			fr: `Je n'ai pas modifié les règles. ${seen} Il me faut ${needed} marquées "${goodName}". J'apprends alors à quoi ressemble un bon contact.`,
			"pt-BR": `Não mudei as regras. ${seen} Preciso de ${needed} marcadas como "${goodName}". Assim aprendo como é um bom contato.`,
			tr: `Kuralları değiştirmedim. ${seen} "${goodName}" olarak işaretlenmiş ${needed} gerekiyor. Böylece iyi bir kişinin nasıl göründüğünü öğrenirim.`,
			"zh-Hans": `我没有修改规则。${seen}我需要${needed}被标记为"${goodName}"。这样我才能学会好的联系人是什么样子。`,
		});
	}

	if (bad < TUNER.minBadExamples) {
		const seen = seenVerdicts(good, goodName);
		const needed = atLeastPeople(TUNER.minBadExamples);
		return say({
			en: `I did not change the rules. ${seen} I need ${needed} marked "${badName}". Then I learn whom to leave out.`,
			de: `Ich habe die Regeln nicht angepasst. ${seen} Ich brauche ${needed} mit "${badName}". Dann lerne ich, wen ich aussortieren soll.`,
			es: `No he cambiado las reglas. ${seen} Necesito ${needed} marcadas como "${badName}". Así aprendo a quién dejar fuera.`,
			fr: `Je n'ai pas modifié les règles. ${seen} Il me faut ${needed} marquées "${badName}". J'apprends alors qui laisser de côté.`,
			"pt-BR": `Não mudei as regras. ${seen} Preciso de ${needed} marcadas como "${badName}". Assim aprendo quem deixar de fora.`,
			tr: `Kuralları değiştirmedim. ${seen} "${badName}" olarak işaretlenmiş ${needed} gerekiyor. Böylece kimi dışarıda bırakacağımı öğrenirim.`,
			"zh-Hans": `我没有修改规则。${seen}我需要${needed}被标记为"${badName}"。这样我才能学会该排除谁。`,
		});
	}

	return null;
}

export async function runRulesTune(
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const [samples, counts] = await Promise.all([
		verdictExamples(),
		verdictCounts(),
	]);
	const oneSided = oneSidedReason(counts);
	if (oneSided) {
		await writeWinBackRulesState(db, { note: oneSided });
		return oneSided;
	}

	const current = await readWinBackRules(db);
	const [stats, model] = await Promise.all([
		landscape(current.business.minPallets),
		buildModel("reading"),
	]);

	const system = [
		"You tune the ranking rules of a CRM's win-back list for one sales rep.",
		"The rules decide who appears and in which order. Higher points sort higher. A points value of 0 switches a fact off.",
		"At least one fact keeps points above 0. All of them at 0 leaves the list unranked and is refused.",
		"Keep the business description, products and minimum quantity unless the examples clearly contradict them.",
		"business.sideProducts is the rep's second tier: ware he still wants in the list but values less. A contact whose products only match that tier scores points.sideProductMatch instead of points.productMatch. Keep sideProductMatch below productMatch, and never move his main ware into sideProducts.",
		"Somebody who never wrote to us is not a win-back candidate. Never set include.minFromThem below 1.",
		"Never invent facts. Derive changes from the rep's verdicts: contacts marked good show what matters, contacts marked bad show what does not.",
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(proposalSchema)),
		`The note is written in ${language()}, at most three sentences, and names what you changed and why.`,
	].join("\n");

	const prompt = [
		playbookPrompt(await readPlaybook()),
		`Current rules:\n${JSON.stringify(current)}`,
		`Workspace numbers: ${JSON.stringify(stats)}`,
		`Rep verdicts (${samples.length}):\n${JSON.stringify(samples).slice(0, MEMORY.bodyMaxChars * 12)}`,
	].join("\n\n");

	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			system: lastError
				? `${system}\n\nYour previous answer was rejected: ${lastError}`
				: system,
			prompt,
		});

		let text = "";
		for await (const part of result.textStream) text += part;

		try {
			const cleaned = text.replace(/```(?:json)?/gi, "").trim();
			const first = cleaned.indexOf("{");
			const last = cleaned.lastIndexOf("}");
			const parsed = proposalSchema.safeParse(
				JSON.parse(cleaned.slice(first, last + 1)),
			);
			if (!parsed.success) {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
					.slice(0, 400);
				continue;
			}

			if (!rankable(parsed.data.rules.points)) {
				lastError =
					"every points value is 0, which leaves the list with no ranking at all; keep at least one fact above 0";
				continue;
			}

			const rules: WinBackRules = {
				...parsed.data.rules,
				include: {
					...parsed.data.rules.include,
					minFromThem: Math.max(parsed.data.rules.include.minFromThem, 1),
				},
				business: current.business,
			};
			await writeWinBackRules(db, rules);
			await writeWinBackRulesState(db, {
				note: parsed.data.note,
				tunedAt: new Date(),
			});

			return `Rules tuned from ${samples.length} verdicts: ${parsed.data.note.slice(0, 160)}`;
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	throw new Error(`The model did not return usable rules: ${lastError}`);
}
