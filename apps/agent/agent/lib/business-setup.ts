import { db } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import {
	DEFAULT_WIN_BACK_RULES,
	readWinBackRules,
	type WinBackRules,
	writeWinBackRules,
	writeWinBackRulesState,
} from "@crm/validation/win-back-rules";
import { streamText } from "ai";
import { z } from "zod";
import { runFieldProposals } from "./field-proposals";
import { language, say } from "./language";
import { directModel } from "./model";
import { fetchPage } from "./website-brand";
import { identity } from "./workspace";

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

export async function runBusinessSetup(
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const [current, threads, us] = await Promise.all([
		readWinBackRules(db),
		db.emailThread.count(),
		identity(),
	]);
	const from = setupSource(current.business, threads);

	if (!from) {
		return say({
			en: "The business rules are already set. I changed nothing.",
			de: "Die Geschäftsregeln stehen schon. Ich habe nichts geändert.",
			es: "Las reglas del negocio ya están definidas. No he cambiado nada.",
			fr: "Les règles de l'entreprise sont déjà définies. Je n'ai rien changé.",
			"pt-BR": "As regras do negócio já estão definidas. Não mudei nada.",
			tr: "İş kuralları zaten belirlendi. Hiçbir şeyi değiştirmedim.",
			"zh-Hans": "业务规则已经设定好了。我没有做任何更改。",
		});
	}

	const fromMail = from === "mail";
	const page = !fromMail && us?.website ? await fetchPage(us.website) : null;

	if (!fromMail && !page) {
		const needed = BUSINESS_SETUP.minThreads;
		const note = say({
			en: `I am still waiting. I need ${needed} conversations or a readable website to say what this business sells. There are ${threads} conversations now.`,
			de: `Ich warte noch. Erst ab ${needed} Verläufen oder mit einer lesbaren Website kann ich sagen, womit hier gehandelt wird. Aktuell sind es ${threads}.`,
			es: `Sigo esperando. Necesito ${needed} conversaciones o un sitio web legible para saber qué vende este negocio. Ahora hay ${threads} conversaciones.`,
			fr: `J'attends encore. Il me faut ${needed} conversations ou un site web lisible pour dire ce que vend cette entreprise. Il y a ${threads} conversations pour l'instant.`,
			"pt-BR": `Ainda estou esperando. Preciso de ${needed} conversas ou de um site legível para dizer o que este negócio vende. Agora são ${threads} conversas.`,
			tr: `Hâlâ bekliyorum. Bu işletmenin ne sattığını söylemek için ${needed} yazışmaya veya okunabilir bir web sitesine ihtiyacım var. Şu anda ${threads} yazışma var.`,
			"zh-Hans": `我还在等待。需要 ${needed} 个对话或一个可读取的网站，才能判断这家企业卖什么。目前有 ${threads} 个对话。`,
		});
		await writeWinBackRulesState(db, { note });
		return note;
	}

	const [source, model] = await Promise.all([
		page
			? `The company's own homepage (${page.url.toString()}):\n${page.title ?? ""}\n${page.metaDescription ?? ""}\n${page.text}`
			: sample().then(
					(transcript) =>
						`Recent conversations (${BUSINESS_SETUP.threadSample} newest):\n${transcript}`,
				),
		buildModel("reading", "business-setup"),
	]);

	const system = [
		"You read a company's own mailbox or homepage and work out what they sell, so a CRM can score win-back candidates for them.",
		"Report only what the source shows. Never invent a product line.",
		`description: one or two sentences in ${language()}, naming what they sell or buy and to whom. Write it as the company would, in the first person plural.`,
		"products: the main products or services, as the words that appear in the source. Include the singular form a substring match would catch.",
		"sideProducts: products or services they also offer but value less. Leave it empty when nothing fits.",
		"boxProducts: the words for goods counted in boxes or containers rather than single units. Leave it empty when nothing fits.",
		"minPallets: the smallest quantity that counts as a big order for the main products, counted in unit. minBoxes: the same for box goods. Read real numbers out of the source. Use 0 when the source never names quantities.",
		`unit: the plural word for what minPallets counts, in ${language()} even when the source uses another language, for example the ${language()} word for units, projects, licenses or seats.`,
		`note: one or two ${language()} sentences saying what you concluded and from what.`,
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(businessProposal, { io: "input" })),
	].join("\n");

	const prompt = [
		us
			? `The company: ${us.name}${us.website ? ` (${us.website})` : ""}${us.profile ? `\n${us.profile.narrative.slice(0, 1_200)}` : ""}`
			: "The company did not fill in its own name or website.",
		source,
	].join("\n\n");

	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
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
			const parsed = businessProposal.safeParse(
				JSON.parse(cleaned.slice(first, last + 1)),
			);

			if (!parsed.success) {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
					.slice(0, 400);
				continue;
			}

			if (parsed.data.products.length === 0) {
				lastError = "products was empty, name at least one";
				continue;
			}

			const { note, ...proposal } = parsed.data;

			await writeWinBackRules(db, {
				...current,
				business: mergeBusiness(current.business, proposal, fromMail),
			});
			await writeWinBackRulesState(db, { note, mode: "auto" });

			if (!fromMail) return note;

			return `${note} ${await runFieldProposals(source, buildModel)}`;
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	const note = say({
		en: `I could not work out the business rules myself: ${lastError}`,
		de: `Ich konnte die Geschäftsregeln nicht selbst finden: ${lastError}`,
		es: `No he podido deducir yo mismo las reglas del negocio: ${lastError}`,
		fr: `Je n'ai pas pu déterminer moi-même les règles de l'entreprise : ${lastError}`,
		"pt-BR": `Não consegui descobrir sozinho as regras do negócio: ${lastError}`,
		tr: `İş kurallarını kendim çıkaramadım: ${lastError}`,
		"zh-Hans": `我无法自行确定业务规则：${lastError}`,
	});
	await writeWinBackRulesState(db, { note });

	return note;
}
