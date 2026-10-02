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
import { COPY } from "./copy";
import { DRAFT } from "./draft-config";
import {
	conversation,
	type DraftPromptInput,
	draftPrompt,
	type SentSample,
} from "./draft-prompt";
import { askJson } from "./insight";
import { language, say } from "./language";
import { directModel } from "./model";
import { playbookVoicePrompt, readPlaybook } from "./playbook";
import { untrusted } from "./untrusted";

const draftSchema = z.object({
	subject: z.string().trim().min(1).max(DRAFT.subjectMaxChars),
	body: z.string().trim().min(1).max(DRAFT.textMaxChars),
	language: z.string().trim().min(2).max(20),
	role: draftRole.catch("unclear"),
});

const revisedSchema = draftSchema.extend({
	styleRule: z.string().trim().nullable().catch(null),
});

type DraftRecipient = NonNullable<Awaited<ReturnType<typeof recipient>>>;

async function recipient(contactId: string) {
	const person = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			company: { select: { name: true } },
			owner: { select: { id: true, name: true } },
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
						orderBy: { sentAt: "desc" },
						take: DRAFT.messagesPerThread,
						select: {
							direction: true,
							fromName: true,
							fromEmail: true,
							subject: true,
							sentAt: true,
							body: true,
							snippet: true,
						},
					},
				},
			},
		},
	});
	if (!person) return null;

	return {
		...person,
		emailThreads: person.emailThreads.map((thread) => ({
			...thread,
			messages: [...thread.messages].reverse(),
		})),
	};
}

async function sentBy(where: {
	fromEmail: string | { in: string[] };
	thread: { contactId: string | { not: string } };
}): Promise<SentSample[]> {
	const rows = await db.emailMessage.findMany({
		where: { direction: "OUTBOUND", ...where },
		orderBy: { sentAt: "desc" },
		take: DRAFT.voice.pool,
		select: { subject: true, body: true, snippet: true },
	});

	return rows.map((row) => ({
		subject: row.subject,
		body: row.body ?? row.snippet ?? "",
	}));
}

type VoiceOwner = Pick<DraftRecipient, "id" | "owner" | "emailThreads">;

type Sender = {
	where: { fromEmail: string | { in: string[] } };
	name: string | null;
};

async function addressesOf(userId: string): Promise<string[]> {
	const [user, mailboxes, imap] = await Promise.all([
		db.user.findUnique({ where: { id: userId }, select: { email: true } }),
		db.mailboxSync.findMany({
			where: { userId, address: { not: null } },
			select: { address: true },
		}),
		db.imapAccount.findMany({ where: { userId }, select: { email: true } }),
	]);

	return [
		user?.email,
		...mailboxes.map((row) => row.address),
		...imap.map((row) => row.email),
	]
		.filter((address): address is string => Boolean(address))
		.map((address) => address.trim().toLowerCase());
}

async function sender(person: VoiceOwner): Promise<Sender | null> {
	const latest = person.emailThreads
		.flatMap((thread) => thread.messages)
		.filter((message) => message.direction === "OUTBOUND" && message.fromEmail)
		.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
	if (latest?.fromEmail) {
		return { where: { fromEmail: latest.fromEmail }, name: latest.fromName };
	}
	if (person.owner) {
		return {
			where: { fromEmail: { in: await addressesOf(person.owner.id) } },
			name: person.owner.name,
		};
	}

	const addresses = await db.emailMessage.groupBy({
		by: ["fromEmail"],
		where: { direction: "OUTBOUND" },
		orderBy: { fromEmail: "asc" },
		take: 2,
	});
	const only = addresses.length === 1 ? addresses[0]?.fromEmail : undefined;
	if (!only) return null;

	const named = await db.emailMessage.findFirst({
		where: { direction: "OUTBOUND", fromEmail: only, fromName: { not: null } },
		orderBy: { sentAt: "desc" },
		select: { fromName: true },
	});

	return { where: { fromEmail: only }, name: named?.fromName ?? null };
}

export async function ownVoice(person: VoiceOwner): Promise<{
	senderName: string | null;
	voice: DraftPromptInput["voice"];
}> {
	const who = await sender(person);
	if (!who) return { senderName: null, voice: { toContact: [], general: [] } };

	const [toContact, general] = await Promise.all([
		sentBy({ ...who.where, thread: { contactId: person.id } }),
		sentBy({ ...who.where, thread: { contactId: { not: person.id } } }),
	]);

	return { senderName: who.name, voice: { toContact, general } };
}

function facts(person: DraftRecipient, senderName: string | null): string {
	const memory = person.memory;
	const name = [person.firstName, person.lastName].filter(Boolean).join(" ");

	return [
		`Recipient: ${name}`,
		person.title ? `Their role: ${person.title}` : "",
		person.company ? `Their company: ${person.company.name}` : "",
		senderName ? `The email comes from: ${senderName}` : "",
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

async function context(
	person: DraftRecipient,
	buildModel: typeof directModel,
	previous: DraftPromptInput["previous"],
) {
	const [rules, playbook, style, own, model] = await Promise.all([
		readWinBackRules(db),
		readPlaybook(),
		readDraftStyle(db),
		ownVoice(person),
		buildModel("draft", "email-draft"),
	]);

	const business = [
		rules.business.description
			? `What this business does: ${rules.business.description}`
			: "",
		rules.business.products.length
			? `What it offers: ${rules.business.products.join(", ")}`
			: "",
	];

	const { system, prompt } = draftPrompt({
		today: new Date(),
		facts: facts(person, own.senderName),
		threads: person.emailThreads,
		voice: own.voice,
		previous,
		style: draftStylePrompt(style),
		playbook: playbookVoicePrompt(playbook),
		business,
	});

	return { system, prompt, model };
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
	oneOff: boolean,
): Promise<string> {
	const current = await db.emailDraft.findUnique({
		where: { contactId: person.id },
		select: { subject: true, body: true },
	});

	if (!current) return runEmailDraft(person.id, null, buildModel);

	const {
		system: base,
		prompt,
		model,
	} = await context(person, buildModel, null);

	const system = [
		base,
		"",
		"The sender read your draft and says what he wants different. Rewrite the whole email so it follows him.",
		"Keep everything he did not complain about.",
		"A price, a quantity, a quality class or a date he writes goes into the email exactly as he wrote it. Never round it, never widen it into a range, never invent a second number beside it.",
		"Write a price the way the email's language does, in German '5,00 € zzgl. MwSt.'.",
		...(oneOff
			? [
					"His wish is for this one email only. It is never a rule for other emails. Set styleRule to null.",
				]
			: [
					"Then decide whether his wish is a lasting rule for every future email, or whether it only fits this one email.",
					`A lasting rule goes into styleRule, in ${language()}, as one short sentence under ${DRAFT_STYLE.ruleMaxChars} characters.`,
					"Set styleRule to null when the wish only fits this one email, for example a name, a quantity or a date.",
					"Set styleRule to null when a rule below already says the same thing.",
				]),
	].join("\n");

	const object = await askJson(
		model,
		revisedSchema,
		system,
		[
			prompt,
			"",
			`The draft so far:\nSubject: ${current.subject}\n${current.body}`,
			"",
			`What the sender wants different:\n${instruction}`,
		].join("\n"),
		revisedSchema,
		{
			maxOutputTokens: DRAFT.maxOutputTokens,
			providerOptions: DRAFT.providerOptions,
		},
	);

	await store(person.id, person, object, model.modelId);
	if (!oneOff) await learn(object.styleRule);

	return say(
		COPY.drafts.rewritten(
			object.subject.slice(0, MEMORY.messageSummaryMaxChars),
		),
	);
}

export async function runEmailDraft(
	contactId: string,
	instruction?: string | null,
	buildModel: typeof directModel = directModel,
	oneOff = false,
): Promise<string> {
	const person = await recipient(contactId);
	if (!person) return say(COPY.drafts.contactGone);

	if (instruction) return revise(person, instruction, buildModel, oneOff);

	if (!conversation(person.emailThreads).trim()) {
		return say(COPY.drafts.noConversation);
	}

	const previous = await db.emailDraft.findUnique({
		where: { contactId },
		select: { subject: true, body: true },
	});
	const { system, prompt, model } = await context(person, buildModel, previous);

	const object = await askJson(
		model,
		draftSchema,
		system,
		prompt,
		draftSchema,
		{
			maxOutputTokens: DRAFT.maxOutputTokens,
			providerOptions: DRAFT.providerOptions,
		},
	);

	await store(contactId, person, object, model.modelId);

	return say(
		COPY.drafts.ready(object.subject.slice(0, MEMORY.messageSummaryMaxChars)),
	);
}
