import { db } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import {
	DRAFT_STYLE,
	draftRole,
	draftStylePrompt,
	readDraftStyle,
	withDraftStyleRule,
	writeDraftStyle,
} from "@crm/validation/draft-style";
import { readWinBackRules } from "@crm/validation/win-back-rules";
import { z } from "zod";
import { askJson } from "./insight";
import { language } from "./language";
import { directModel } from "./model";
import { playbookVoicePrompt, readPlaybook } from "./playbook";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

export const DRAFT = {
	threads: 3,
	messagesPerThread: 8,
	bodyMaxChars: 1_200,
	subjectMaxChars: 140,
	textMaxChars: 2_000,
	samples: 3,
	samplePool: 30,
	sampleMinChars: 120,
	sampleMaxChars: 700,
	learnAttempts: 3,
	recentDrafts: 8,
	openingMaxChars: 120,
} as const;

const draftSchema = z.object({
	subject: z.string().trim().min(1).max(DRAFT.subjectMaxChars),
	body: z.string().trim().min(1).max(DRAFT.textMaxChars),
	language: z.string().trim().min(2).max(20),
	role: draftRole.catch("unclear"),
});

const revisedSchema = draftSchema.extend({
	styleRule: z.string().trim().nullable().catch(null),
});

const QUOTE_START = [
	/^\s*>/,
	/^\s*am .{4,80}\s(schrieb|geschrieben)\b/i,
	/^\s*on .{4,80}\swrote:/i,
	/^\s*-{2,}\s*(urspr|original|forwarded|weitergeleitete)/i,
	/^\s*von:\s/i,
	/^\s*from:\s/i,
	/^\s*gesendet:\s/i,
];

const SIGNATURE_START = [
	/^\s*-{2,}\s*$/,
	/^\s*_{3,}\s*$/,
	/^\s*(www\.|e:|m:|t:|tel:|fon:|mobil:)/i,
	/^\s*ust[- ]?idnr/i,
	/^\s*hrb\s/i,
];

type DraftRecipient = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
	company: { name: string } | null;
	owner: { name: string | null } | null;
	memory: {
		summary: string;
		didBusiness: number;
		openInquiries: number;
		products: string[];
	} | null;
	emailThreads: {
		subject: string | null;
		lastMessageAt: Date;
		messages: {
			direction: string;
			fromName: string | null;
			fromEmail: string | null;
			sentAt: Date;
			body: string | null;
			snippet: string | null;
		}[];
	}[];
};

function cutAt(body: string, markers: RegExp[]): string {
	const lines = body.replace(/\r\n?/g, "\n").split("\n");
	const end = lines.findIndex((line) =>
		markers.some((pattern) => pattern.test(line)),
	);
	const kept = end === -1 ? lines : lines.slice(0, end);

	return kept
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function stripQuoted(body: string): string {
	return cutAt(body, QUOTE_START);
}

export function stripSignature(body: string): string {
	return cutAt(body, SIGNATURE_START);
}

async function recipient(contactId: string): Promise<DraftRecipient | null> {
	return db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			company: { select: { name: true } },
			owner: { select: { name: true } },
			memory: {
				select: {
					summary: true,
					didBusiness: true,
					openInquiries: true,
					products: true,
				},
			},
			emailThreads: {
				orderBy: { lastMessageAt: "desc" },
				take: DRAFT.threads,
				select: {
					subject: true,
					lastMessageAt: true,
					messages: {
						orderBy: { sentAt: "asc" },
						select: {
							direction: true,
							fromName: true,
							fromEmail: true,
							sentAt: true,
							body: true,
							snippet: true,
						},
					},
				},
			},
		},
	});
}

export async function styleSamples(exceptContactId: string): Promise<string> {
	const messages = await db.emailMessage.findMany({
		where: {
			direction: "OUTBOUND",
			thread: { contactId: { not: exceptContactId } },
		},
		orderBy: { sentAt: "desc" },
		take: DRAFT.samplePool,
		select: { subject: true, body: true, snippet: true },
	});

	const picked: string[] = [];
	for (const message of messages) {
		if (picked.length === DRAFT.samples) break;

		const text = stripSignature(
			stripQuoted(message.body ?? message.snippet ?? ""),
		);
		if (text.length < DRAFT.sampleMinChars) continue;

		picked.push(
			`Subject: ${message.subject ?? ""}\n${text.slice(0, DRAFT.sampleMaxChars)}`,
		);
	}

	if (picked.length === 0) return "";

	return [
		"Emails the sender wrote himself, to other people. Copy his wording and his tone.",
		"Never copy their greeting or their sign off: those belong to their own thread, not to this one.",
		"Never copy a fact, a price or a name out of them.",
		picked
			.map((sample, index) => `#${index + 1}\n${sample}`)
			.join("\n\n---\n\n"),
	].join("\n");
}

export async function recentOpenings(exceptContactId: string): Promise<string> {
	const rows = await db.emailDraft.findMany({
		where: { contactId: { not: exceptContactId } },
		orderBy: { updatedAt: "desc" },
		take: DRAFT.recentDrafts,
		select: { subject: true, body: true },
	});

	const seen = rows
		.map((row) => {
			const line = row.body
				.split("\n")
				.map((part) => part.trim())
				.find((part, index) => index > 0 && part.length > 20);

			return line
				? `${row.subject} | ${line.slice(0, DRAFT.openingMaxChars)}`
				: "";
		})
		.filter(Boolean);

	if (seen.length === 0) return "";

	return [
		"These subjects and questions already went to other contacts. Write a different subject, and where the role allows it pick a different approved sentence, so the emails do not all read the same. Never invent a sentence that is not on the approved list to be different:",
		...seen.map((line) => `- ${line}`),
	].join("\n");
}

function conversation(person: DraftRecipient): string {
	return person.emailThreads
		.map((thread) => {
			const lines = thread.messages
				.slice(-DRAFT.messagesPerThread)
				.map((message) => {
					const who =
						message.direction === "OUTBOUND"
							? "WE"
							: `THEY (${message.fromName ?? message.fromEmail ?? "unknown"})`;
					const text = (message.body ?? message.snippet ?? "").slice(
						0,
						DRAFT.bodyMaxChars,
					);
					return `[${message.sentAt.toISOString().slice(0, 10)}] ${who}:\n${text}`;
				})
				.join("\n\n");

			return `Subject: ${thread.subject ?? "(no subject)"}\n${lines}`;
		})
		.join("\n\n===\n\n");
}

function facts(person: DraftRecipient): string {
	const memory = person.memory;
	const name = [person.firstName, person.lastName].filter(Boolean).join(" ");

	return [
		`Recipient: ${name}`,
		person.title ? `Their role: ${person.title}` : "",
		person.company ? `Their company: ${person.company.name}` : "",
		person.owner?.name ? `The email comes from: ${person.owner.name}` : "",
		memory ? `What we know about them: ${untrusted(memory.summary)}` : "",
		memory?.didBusiness ? `Closed deals with them: ${memory.didBusiness}` : "",
		memory?.openInquiries
			? `Inquiries of theirs left open: ${memory.openInquiries}`
			: "",
		memory?.products.length
			? `Products they talked about: ${memory.products.join(", ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

function systemPrompt(parts: {
	playbook: string;
	samples: string;
	style: string;
	openings: string;
	business: string[];
	product: string;
}): string {
	return [
		"You write one short follow up email for a small business to a contact it spoke to a while ago.",
		UNTRUSTED_RULE,
		"Write in the language the conversation itself uses. German conversation means a German email.",
		`Before you write, settle one thing from the conversation: is this contact a SELLER who offered ${parts.product} to us, or a BUYER who bought ${parts.product} from us?`,
		`A SELLER offered us ${parts.product}, asked what we pay, named a quantity they hold, or arranged a pickup at their own site.`,
		`A BUYER asked us for ${parts.product}, asked our selling price, or took a delivery from us.`,
		"Ask only the question that fits that one role. Never put both roles in one sentence.",
		"Report the role you settled on in the role field: seller, buyer, or unclear when the conversation does not say.",
		"When the role is unclear, ask the question that fits what this business mostly does, as its description below says.",
		`For a SELLER ask only whether ${parts.product} is available again. In English: I wanted to ask whether you have ${parts.product} available again. In German pick one of these sentences and change nothing in it but the product:\n- Ich wollte kurz nachfragen, ob Sie aktuell wieder ${parts.product} zur Abholung verfügbar haben.\n- Ich wollte noch einmal kurz nachfragen, ob bei Ihnen aktuell ${parts.product} zur Abholung verfügbar sind.\n- Ich wollte kurz nachfragen, wie es aktuell mit ${parts.product} bei Ihnen aussieht.\n- Haben Sie mittlerweile wieder ${parts.product} zur Abholung verfügbar?`,
		`For a BUYER ask only about their own need. In English: I wanted to ask whether you need ${parts.product} again. In German: Ich wollte kurz nachfragen, ob Sie aktuell wieder Bedarf an ${parts.product} haben.`,
		`When the contact traded something other than ${parts.product}, keep the same sentence and name that product instead.`,
		`Never write any of these. They read like an automated sales email:\n- I just wanted to touch base and see how things are going.\n- I hope this email finds you well.\n- Ich möchte kurz hören, wie es bei Ihnen aktuell aussieht.\n- Ich melde mich kurz wegen ${parts.product}.\n- Ich möchte mich nach der aktuellen Lage bei Ihnen erkundigen.\n- Wie ist die Lage bei Ihnen aktuell?`,
		"Ask one thing only. Add no second question, no selling question, no price, no minimum quantity and no payment terms.",
		"Do not recall the old conversation. Do not summarise it, do not name what was agreed, do not say when it was.",
		"Never repeat a price, a quantity, a quality class or a date out of the old conversation. Those numbers are old and they are not an offer.",
		"Never invent a fact.",
		"The facts below may carry old numbers. Never put a number out of them into the email.",
		"Never use the characters em dash, en dash, horizontal bar or figure dash anywhere in the text.",
		"Take the greeting from the thread itself and keep the same register. A formal German thread opens 'Sehr geehrter Herr [Nachname],' or 'Sehr geehrte Frau [Nachname],'. A thread that already says 'Hallo' or 'Guten Tag' opens 'Guten Tag Herr [Nachname],' or 'Hallo Herr [Nachname],'.",
		"Never use a first name when the thread uses surnames.",
		"A German greeting ends with a comma, so the first word of the next sentence is lower case: 'Hallo Herr Meier,' then 'ich wollte kurz nachfragen', and 'Guten Tag Frau Meier,' then 'haben Sie mittlerweile'.",
		"Close with a sign off that names the sender. In German that is 'Mit freundlichen Grüßen' and the sender name on the next line. Write no second signature and no contact details under it.",
		"The body is the one question, and at most one short sentence before it. Never more.",
		"Never add a sentence to sound more professional. A very plain email beats a polished one.",
		"Write plain sentences. Never use a bullet list or a numbered list.",
		"A short 'Vielen Dank vorab.' may stand between the question and the sign off.",
		"The email reads as if the sender already has this contact in mind and asks in passing. It never reads as a system writing to a lead.",
		"Never use an emoji or a decorative symbol, in the subject or in the body.",
		"In a German email, never write these phrases or anything near them: 'Ich hoffe, diese Nachricht erreicht Sie wohlauf.', 'Gerne möchte ich Ihnen mitteilen.', 'Bezugnehmend auf Ihre geschätzte Anfrage.', 'Wir wissen Ihr Interesse sehr zu schätzen.'",
		"The subject line is plain and short, under 60 characters. It does not refer back to an old thread.",
		`This German email to a seller is the shape to hit:\nHallo Herr Mustermann,\n\nich wollte kurz nachfragen, ob Sie aktuell wieder ${parts.product} zur Abholung verfügbar haben.\n\nVielen Dank vorab.\n\nMit freundlichen Grüßen\nAnna Schmidt`,
		parts.openings,
		parts.samples,
		parts.style,
		parts.playbook,
		...parts.business,
	]
		.filter(Boolean)
		.join("\n");
}

async function context(person: DraftRecipient, buildModel: typeof directModel) {
	const [rules, playbook, style, samples, openings, model] = await Promise.all([
		readWinBackRules(db),
		readPlaybook(),
		readDraftStyle(db),
		styleSamples(person.id),
		recentOpenings(person.id),
		buildModel("draft", "email-draft"),
	]);

	const business = [
		rules.business.description
			? `What this business does: ${rules.business.description}`
			: "",
		rules.business.products.length
			? `What it trades: ${rules.business.products.join(", ")}`
			: "",
	];

	return {
		playbook: playbookVoicePrompt(playbook),
		style,
		samples,
		openings,
		model,
		business,
		product: rules.business.products[0] ?? "what they traded with us",
	};
}

function measure(person: DraftRecipient) {
	const basedOnUntil = person.emailThreads.reduce<Date | null>(
		(latest, thread) =>
			latest === null || thread.lastMessageAt > latest
				? thread.lastMessageAt
				: latest,
		null,
	);
	const basedOnCount = person.emailThreads.reduce(
		(sum, thread) => sum + thread.messages.length,
		0,
	);

	return { basedOnUntil, basedOnCount };
}

async function store(
	contactId: string,
	person: DraftRecipient,
	object: z.infer<typeof draftSchema>,
	modelId: string,
): Promise<void> {
	const fields = {
		subject: object.subject.slice(0, DRAFT.subjectMaxChars),
		body: object.body.slice(0, DRAFT.textMaxChars),
		language: object.language,
		role: object.role,
		modelId,
		...measure(person),
	};

	await db.emailDraft.upsert({
		where: { contactId },
		create: { contactId, ...fields },
		update: fields,
	});
}

async function learn(text: string | null): Promise<void> {
	if (!text) return;

	const store = async () =>
		db.$transaction(
			async (tx) => {
				const next = withDraftStyleRule(await readDraftStyle(tx), {
					id: crypto.randomUUID(),
					text,
					learnedAt: new Date().toISOString(),
				});

				await writeDraftStyle(tx, next);
			},
			{ isolationLevel: "Serializable" },
		);

	for (let attempt = 0; attempt < DRAFT.learnAttempts; attempt += 1) {
		try {
			await store();
			return;
		} catch (error) {
			if (attempt === DRAFT.learnAttempts - 1) {
				console.error(`[agent] the style rule is not kept: ${String(error)}`);
			}
		}
	}
}

async function revise(
	person: DraftRecipient,
	instruction: string,
	buildModel: typeof directModel,
): Promise<string> {
	const current = await db.emailDraft.findUnique({
		where: { contactId: person.id },
		select: { subject: true, body: true },
	});

	if (!current) return runEmailDraft(person.id, null, buildModel);

	const { playbook, style, samples, openings, model, business, product } =
		await context(person, buildModel);

	const system = [
		systemPrompt({
			playbook,
			samples,
			business,
			product,
			openings,
			style: draftStylePrompt(style),
		}),
		"",
		"The sender read your draft and says what he wants different. Rewrite the whole email so it follows him.",
		"Keep everything he did not complain about.",
		"A price, a quantity, a quality class or a date he writes goes into the email exactly as he wrote it. Never round it, never widen it into a range, never invent a second number beside it.",
		"Write a price the way the email's language does, in German '5,00 € zzgl. MwSt. pro Stück'. Say the price includes pickup or delivery only when he says so.",
		"Then decide whether his wish is a lasting rule for every future email, or whether it only fits this one email.",
		`A lasting rule goes into styleRule, in ${language()}, as one short sentence under ${DRAFT_STYLE.ruleMaxChars} characters.`,
		"Set styleRule to null when the wish only fits this one email, for example a name, a quantity or a date.",
		"Set styleRule to null when a rule below already says the same thing.",
	].join("\n");

	const object = await askJson(
		model,
		revisedSchema,
		system,
		[
			facts(person),
			"",
			`The draft so far:\nSubject: ${current.subject}\n${current.body}`,
			"",
			`What the sender wants different:\n${instruction}`,
		].join("\n"),
	);

	await store(person.id, person, object, model.modelId);
	await learn(object.styleRule);

	return `The draft is rewritten: ${object.subject.slice(0, MEMORY.messageSummaryMaxChars)}`;
}

export async function runEmailDraft(
	contactId: string,
	instruction?: string | null,
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const person = await recipient(contactId);
	if (!person) return "The contact is gone.";

	if (instruction) return revise(person, instruction, buildModel);

	const talk = conversation(person);
	if (!talk.trim()) return "There is no conversation to build a draft on.";

	const { playbook, style, samples, openings, model, business, product } =
		await context(person, buildModel);

	const system = systemPrompt({
		playbook,
		samples,
		business,
		product,
		openings,
		style: draftStylePrompt(style),
	});

	const object = await askJson(
		model,
		draftSchema,
		system,
		`${facts(person)}\n\nThe conversation so far, oldest message first. Read it only to learn who this is and what they trade. Do not quote it:\n\n${untrusted(talk)}`,
	);

	await store(contactId, person, object, model.modelId);

	return `A draft is ready: ${object.subject.slice(0, MEMORY.messageSummaryMaxChars)}`;
}
