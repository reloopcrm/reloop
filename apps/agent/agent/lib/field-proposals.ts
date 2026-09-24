import { db } from "@crm/db";
import {
	FIELD_ENTITIES,
	FIELD_LIMITS,
	type FieldEntityName,
	fieldKeyFromLabel,
} from "@crm/db/fields-shape";
import { MEMORY } from "@crm/db/insights";
import {
	FIELD_PROPOSAL_KIND,
	type FieldProposalPayload,
	fieldProposalSubject,
	PROPOSABLE_FIELD_TYPES,
} from "@crm/validation/field-proposal";
import { streamText } from "ai";
import { z } from "zod";
import { language, say } from "./language";
import { directModel, modelUnavailable } from "./model";

const trimmed = (max: number) =>
	z
		.string()
		.transform((text) => text.trim().slice(0, max))
		.refine((text) => text.length > 0, "empty");

const proposedField = z.object({
	entity: z.enum(FIELD_ENTITIES),
	label: trimmed(60),
	type: z.enum(PROPOSABLE_FIELD_TYPES),
	options: z
		.array(trimmed(60))
		.max(FIELD_LIMITS.maxOptions)
		.default([])
		.transform((entries) => [...new Set(entries)]),
	agentBrief: trimmed(400),
	evidence: trimmed(200),
	seen: z.number().int().min(0).max(100_000),
});

export const fieldProposalSet = z.object({
	fields: z.array(proposedField).max(12).default([]),
	note: trimmed(400),
});

export type ProposedField = z.infer<typeof proposedField>;

export type ExistingField = {
	entity: FieldEntityName;
	key: string;
	archived: boolean;
};

export type ChosenField = {
	payload: FieldProposalPayload;
	evidence: string;
};

export function roomFor(
	fields: readonly ExistingField[],
	offered: readonly string[],
) {
	const left = (entity: FieldEntityName) =>
		Math.max(
			0,
			FIELD_LIMITS.perEntity -
				fields.filter((field) => field.entity === entity && !field.archived)
					.length -
				offered.filter((subject) => subject.startsWith(`${entity}:`)).length,
		);

	return {
		COMPANY: left("COMPANY"),
		CONTACT: left("CONTACT"),
		DEAL: left("DEAL"),
	};
}

export function chooseFields(input: {
	proposals: readonly ProposedField[];
	fields: readonly ExistingField[];
	offered: readonly string[];
}): ChosenField[] {
	const room = roomFor(input.fields, input.offered);
	const taken = new Set(
		input.fields.map((field) => fieldProposalSubject(field.entity, field.key)),
	);
	const decided = new Set(input.offered);
	const chosen: ChosenField[] = [];

	for (const proposal of input.proposals) {
		if (chosen.length >= FIELD_LIMITS.proposalsPerRun) break;
		if (proposal.seen < FIELD_LIMITS.minMentions) continue;
		if (room[proposal.entity] <= 0) continue;
		if (proposal.type === "SELECT" && proposal.options.length === 0) continue;

		const key = fieldKeyFromLabel(proposal.label);
		if (!key) continue;

		const subject = fieldProposalSubject(proposal.entity, key);
		if (taken.has(subject) || decided.has(subject)) continue;

		decided.add(subject);
		room[proposal.entity] -= 1;

		chosen.push({
			evidence: proposal.evidence,
			payload: {
				entity: proposal.entity,
				key,
				label: proposal.label,
				type: proposal.type,
				options: proposal.type === "SELECT" ? proposal.options : [],
				agentBrief: proposal.agentBrief,
				seen: proposal.seen,
			},
		});
	}

	return chosen;
}

export async function readProposalState(): Promise<{
	fields: ExistingField[];
	offered: string[];
}> {
	const [definitions, proposals] = await Promise.all([
		db.fieldDefinition.findMany({
			select: { entity: true, key: true, archivedAt: true },
		}),
		db.agentTask.findMany({
			where: { kind: FIELD_PROPOSAL_KIND },
			select: { subject: true },
		}),
	]);

	return {
		fields: definitions.map((definition) => ({
			entity: definition.entity,
			key: definition.key,
			archived: definition.archivedAt !== null,
		})),
		offered: proposals
			.map((proposal) => proposal.subject)
			.filter((subject): subject is string => subject !== null),
	};
}

export async function offerFields(
	chosen: readonly ChosenField[],
): Promise<void> {
	for (const field of chosen) {
		await db.agentTask.create({
			data: {
				kind: FIELD_PROPOSAL_KIND,
				reason: field.evidence,
				subject: fieldProposalSubject(field.payload.entity, field.payload.key),
				payload: field.payload,
				dueAt: new Date(),
				priority: 0,
				budget: 0,
			},
		});
	}
}

function systemPrompt(room: ReturnType<typeof roomFor>): string {
	return [
		"You read a company's own mailbox and work out which custom CRM fields this business would fill in every week.",
		"A freight forwarder repeats routes, loads and terms of delivery. A law firm repeats matter types, courts and deadlines. An agency repeats retainers and channels. Read what is in front of you and name nothing else.",
		"Propose a field only when the same kind of detail appears in several separate conversations. Count them and put the count in seen.",
		"entity: COMPANY for something true of the whole account, CONTACT for a person, DEAL for one piece of business.",
		`label: two or three words a rep would recognise, in ${language()}.`,
		`type: one of ${PROPOSABLE_FIELD_TYPES.join(", ")}. Use SELECT only when the mail shows a short fixed list, and then fill options with the words the mail uses.`,
		"agentBrief: what would count as an answer and where in a conversation to look for it.",
		`evidence: one ${language()} sentence naming what you saw and in how many conversations, for example "12 mails name a route from one city to another".`,
		`Room left: ${FIELD_ENTITIES.map((entity) => `${entity} ${room[entity]}`).join(", ")}. Never propose more than that for an entity.`,
		"Propose nothing at all rather than a field the mail does not support. An empty fields array is a good answer.",
		`note: one or two ${language()} sentences saying what you concluded and from what.`,
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(fieldProposalSet, { io: "input" })),
	].join("\n");
}

export async function runFieldProposals(
	transcript: string,
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const blocked = await modelUnavailable();
	if (blocked) return blocked;

	const { fields, offered } = await readProposalState();
	const room = roomFor(fields, offered);

	if (FIELD_ENTITIES.every((entity) => room[entity] === 0)) {
		const limit = FIELD_LIMITS.perEntity;
		return say({
			en: `Every record type already holds ${limit} fields or has that many waiting. I propose nothing until one is archived or dismissed.`,
			de: `Jeder Datensatztyp hat bereits ${limit} Felder oder so viele offene Vorschläge. Ich schlage nichts vor, bis eines archiviert oder abgelehnt ist.`,
			es: `Cada tipo de registro ya tiene ${limit} campos o tantas propuestas pendientes. No propongo nada hasta que se archive o se descarte uno.`,
			fr: `Chaque type de fiche contient déjà ${limit} champs ou autant de propositions en attente. Je ne propose rien tant qu'aucun n'est archivé ou refusé.`,
			"pt-BR": `Cada tipo de registro já tem ${limit} campos ou essa quantidade de propostas pendentes. Não proponho nada até que um seja arquivado ou descartado.`,
			tr: `Her kayıt türünde zaten ${limit} alan ya da o kadar bekleyen öneri var. Biri arşivlenene veya reddedilene kadar bir şey önermiyorum.`,
			"zh-Hans": `每种记录类型都已有 ${limit} 个字段或同样数量的待处理建议。在有字段被归档或拒绝之前，我不会再提出建议。`,
		});
	}

	if (!transcript.trim()) {
		return say({
			en: "There is no mail to read yet, so I propose no fields.",
			de: "Es gibt noch keine Mails zu lesen, deshalb schlage ich keine Felder vor.",
			es: "Todavía no hay correos que leer, así que no propongo campos.",
			fr: "Il n'y a encore aucun e-mail à lire, je ne propose donc aucun champ.",
			"pt-BR": "Ainda não há e-mails para ler, então não proponho campos.",
			tr: "Henüz okunacak e-posta yok, bu yüzden alan önermiyorum.",
			"zh-Hans": "目前还没有可读取的邮件，所以我不提出字段建议。",
		});
	}

	const model = await buildModel("reading", "field-proposal");

	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			instructions: [
				{ role: "system" as const, content: systemPrompt(room) },
				...(lastError
					? [
							{
								role: "system" as const,
								content: `Your previous answer was rejected: ${lastError}`,
							},
						]
					: []),
			],
			prompt: transcript,
		});

		let text = "";
		for await (const part of result.textStream) text += part;

		const cleaned = text.replace(/```(?:json)?/gi, "").trim();
		const first = cleaned.indexOf("{");
		const last = cleaned.lastIndexOf("}");

		try {
			const parsed = fieldProposalSet.safeParse(
				JSON.parse(cleaned.slice(first, last + 1)),
			);

			if (!parsed.success) {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
					.slice(0, 400);
				continue;
			}

			const chosen = chooseFields({
				proposals: parsed.data.fields,
				fields,
				offered,
			});

			await offerFields(chosen);

			if (chosen.length === 0) {
				const note = parsed.data.note;
				return say({
					en: `Nothing in the mail repeats often enough to earn a field. ${note}`,
					de: `Nichts in den Mails wiederholt sich oft genug für ein eigenes Feld. ${note}`,
					es: `Nada en los correos se repite lo bastante como para merecer un campo. ${note}`,
					fr: `Rien dans les e-mails ne revient assez souvent pour mériter un champ. ${note}`,
					"pt-BR": `Nada nos e-mails se repete o suficiente para merecer um campo. ${note}`,
					tr: `E-postalarda hiçbir şey bir alanı hak edecek kadar sık tekrarlanmıyor. ${note}`,
					"zh-Hans": `邮件中没有任何内容重复到值得单独设一个字段。${note}`,
				});
			}

			const count = chosen.length;
			const labels = chosen.map((field) => field.payload.label).join(", ");
			return say({
				en: `I propose ${count} field(s): ${labels}. Accept or dismiss each one on the Fields sheet.`,
				de: `Ich schlage ${count} Feld(er) vor: ${labels}. Nimm jedes unter Felder an oder lehne es ab.`,
				es: `Propongo ${count} campo(s): ${labels}. Acepta o descarta cada uno en Campos.`,
				fr: `Je propose ${count} champ(s) : ${labels}. Accepte ou refuse chacun dans Champs.`,
				"pt-BR": `Proponho ${count} campo(s): ${labels}. Aceite ou descarte cada um em Campos.`,
				tr: `${count} alan öneriyorum: ${labels}. Her birini Alanlar bölümünde kabul et veya reddet.`,
				"zh-Hans": `我建议 ${count} 个字段：${labels}。请在字段中逐个接受或拒绝。`,
			});
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	return say({
		en: `I could not read a field proposal out of the mail: ${lastError}`,
		de: `Ich konnte aus den Mails keinen Feldvorschlag lesen: ${lastError}`,
		es: `No he podido sacar una propuesta de campo de los correos: ${lastError}`,
		fr: `Je n'ai pas pu tirer une proposition de champ des e-mails : ${lastError}`,
		"pt-BR": `Não consegui tirar uma proposta de campo dos e-mails: ${lastError}`,
		tr: `E-postalardan bir alan önerisi çıkaramadım: ${lastError}`,
		"zh-Hans": `我无法从邮件中读出字段建议：${lastError}`,
	});
}
