import {
	isAutoReply,
	QUOTE_MARKERS,
	stripQuotedHistory,
} from "@crm/db/message-text";
import { DRAFT } from "./draft-config";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

export type DraftMessage = {
	direction: string;
	fromName: string | null;
	fromEmail: string | null;
	subject: string | null;
	sentAt: Date;
	body: string | null;
	snippet: string | null;
};

export type DraftThread = {
	subject: string | null;
	messages: DraftMessage[];
};

export type SentSample = {
	subject: string | null;
	body: string;
};

export type DraftPromptInput = {
	today: Date;
	facts: string;
	threads: DraftThread[];
	voice: { toContact: SentSample[]; general: SentSample[] };
	previous: { subject: string; body: string } | null;
	style: string;
	playbook: string;
	business: string[];
};

type Formality = "du" | "Sie";

const QUOTE_START = [/^\s*>/, ...QUOTE_MARKERS];

const SIGNATURE_START = [
	/^\s*-{2,}\s*$/,
	/^\s*_{3,}\s*$/,
	/^\s*(www\.|e:|m:|t:|tel:|fon:|mobil:)/i,
	/^\s*ust[- ]?idnr/i,
	/^\s*hrb\s/i,
];

const LANGUAGE_WORDS = {
	German:
		/\b(und|ich|nicht|mit|wir|für|ist|das|die|der|haben|bitte|gerne|auch|noch|wie|hallo|grüße|danke)\b/gi,
	English:
		/\b(and|the|you|with|for|is|we|have|please|thanks|would|this|our|can|hello|regards)\b/gi,
} as const;

type Language = keyof typeof LANGUAGE_WORDS;

const DU_WORDS =
	/\b(du|dich|dir|dein|deine|deinen|deinem|deiner|euch|euer|eure)\b/gi;
const SIE_WORDS = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/g;

const QUOTED_HEADER = [
	/\bOn\s.+?\swrote:/i,
	/\bAm\s.+?\sschrieb\b/i,
	/-{2,}\s*(Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht|Forwarded message)\s*-{2,}/i,
	/\b(Von|From):\s.+\b(Gesendet|Sent|An|To):\s/i,
];

const CLOSING =
	/^(viele|beste|liebe|herzliche|freundliche|mit (freundlichen|besten|herzlichen)|schöne|sonnige|lg|vg|mfg|gruß|grüße|danke|cheers|best|kind regards|regards|many thanks|thanks|all the best|warm regards)\b/i;

const GREETING =
	/^(hallo|hi|hey|moin|servus|liebe[rs]?|werte[rs]?|sehr geehrte[rs]?|guten (tag|morgen|abend)|dear|hello|good (morning|afternoon))\b/i;

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

function ownText(body: string): string {
	return stripSignature(stripQuoted(body));
}

function count(text: string, pattern: RegExp): number {
	return text.match(pattern)?.length ?? 0;
}

export function guessLanguage(texts: string[]): Language | null {
	const text = texts.join("\n");
	const german = count(text, LANGUAGE_WORDS.German);
	const english = count(text, LANGUAGE_WORDS.English);
	if (german === english) return null;

	return german > english ? "German" : "English";
}

export function guessFormality(texts: string[]): Formality | null {
	const text = texts.join("\n");
	const du = count(text, DU_WORDS);
	const sie = count(text, SIE_WORDS);
	if (du === sie) return null;

	return du > sie ? "du" : "Sie";
}

function lines(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

type Shape = {
	greeting: string | null;
	opening: string | null;
	closing: string | null;
	signOff: string | null;
};

function shape(text: string): Shape {
	const all = lines(text);
	const greeting = all[0] && GREETING.test(all[0]) ? all[0] : null;
	const rest = greeting ? all.slice(1) : all;

	let signOffLines = 0;
	while (
		signOffLines < DRAFT.voice.signOffLines &&
		signOffLines < rest.length - 1 &&
		(rest[rest.length - 1 - signOffLines]?.length ?? 0) <=
			DRAFT.voice.signOffLineMaxChars
	) {
		signOffLines += 1;
	}

	const middle = rest.slice(0, rest.length - signOffLines);
	const opening = middle[0] ?? null;
	const closing =
		middle.length > 1 ? (middle[middle.length - 1] ?? null) : null;

	const signOff = signOffLines
		? rest.slice(rest.length - signOffLines).join(" / ")
		: null;

	return {
		greeting,
		opening: opening?.slice(0, DRAFT.openingMaxChars) ?? null,
		closing: closing?.slice(0, DRAFT.openingMaxChars) ?? null,
		signOff:
			signOff && CLOSING.test(signOff) && !/\d/.test(signOff) ? signOff : null,
	};
}

function words(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);

	return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function unique(values: (string | null)[]): string[] {
	return [...new Set(values.filter((value): value is string => !!value))];
}

function listed(values: (string | null)[]): string {
	return unique(values)
		.filter((line) => line.length <= DRAFT.voice.listItemMaxChars)
		.slice(0, DRAFT.voice.listItems)
		.map((line) => `"${line}"`)
		.join(", ");
}

function usable(samples: SentSample[]): string[] {
	return samples
		.map((sample) => ownText(sample.body))
		.filter(
			(text) =>
				text.length >= DRAFT.voice.minChars &&
				!QUOTED_HEADER.some((pattern) => pattern.test(text)),
		);
}

function register(texts: string[]): Formality | null {
	return guessLanguage(texts) === "English" ? null : guessFormality(texts);
}

export function voiceSection(
	voice: DraftPromptInput["voice"],
	fromContact: string[],
): string {
	const toContact = usable(voice.toContact);
	const general = usable(voice.general);
	const own = [...toContact, ...general];
	if (own.length === 0) return "";

	const known = toContact.length > 0;
	const language = guessLanguage(known ? toContact : general);
	const length = median(own.map(words));
	const mine = known ? register(toContact) : null;
	const theirs = known ? null : register(fromContact);

	let budget = DRAFT.voice.totalMaxChars;
	const examples: string[] = [];
	for (const [index, text] of toContact
		.slice(0, DRAFT.voice.examples)
		.entries()) {
		const entry = `#${index + 1}\n${text.slice(0, DRAFT.voice.exampleMaxChars)}`;
		if (entry.length > budget) break;
		budget -= entry.length;
		examples.push(entry);
	}

	const greetings = known
		? listed(toContact.map((text) => shape(text).greeting))
		: "";
	const signOffs = listed(toContact.map((text) => shape(text).signOff));

	return [
		"How the sender writes, taken only from emails he sent himself. Write the way he does.",
		language
			? known
				? `He writes to this contact in ${language}.`
				: `He writes to other people in ${language}.`
			: "",
		mine
			? `He says "${mine}" to this contact. Use "${mine}" in this email.`
			: "",
		theirs
			? `This contact says "${theirs}" to him. Use "${theirs}" in this email.`
			: "",
		known
			? ""
			: "He never wrote to this contact before. Take the greeting and the form of address from the thread.",
		length ? `His emails run about ${length} words. Stay close to that.` : "",
		greetings ? `His greetings to this contact: ${greetings}` : "",
		signOffs ? `His sign offs: ${signOffs}` : "",
		"He never puts a signature block or contact details under his sign off.",
		examples.length
			? "Emails he sent to this contact. They show his voice only. Never copy a fact, a price or a sentence out of them."
			: "",
		...examples,
	]
		.filter(Boolean)
		.join("\n");
}

export function avoidSection(
	previous: DraftPromptInput["previous"],
	toContact: SentSample[],
): string {
	const said = unique(
		[previous?.body ?? null, ...usable(toContact)]
			.filter((text): text is string => !!text)
			.flatMap((text) => {
				const { opening, closing } = shape(text);
				return [opening, closing];
			}),
	).slice(0, DRAFT.voice.avoidLines);

	if (said.length === 0) return "";

	return [
		"This contact already read these sentences from the sender. Open and close differently this time; the greeting and the sign off may stay:",
		...said.map((line) => `- ${line}`),
	].join("\n");
}

function messageText(message: DraftMessage): string {
	return stripQuotedHistory(
		(message.body ?? message.snippet ?? "").replace(/\r\n?/g, "\n"),
	)
		.split("\n")
		.filter((line) => !/^\s*>/.test(line))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function isReal(message: DraftMessage): boolean {
	return (
		messageText(message).length > 0 &&
		!isAutoReply(message.subject, message.body ?? message.snippet ?? "")
	);
}

function render(message: DraftMessage, last: boolean): string {
	const who =
		message.direction === "OUTBOUND"
			? "SENDER"
			: `CONTACT (${message.fromName ?? message.fromEmail ?? "unknown"})`;
	const text = messageText(message).slice(0, DRAFT.bodyMaxChars);

	return `${last ? "LAST MESSAGE " : ""}[${day(message.sentAt)}] ${who}:\n${text}`;
}

function day(at: Date): string {
	return at.toISOString().slice(0, 10);
}

export function conversation(threads: DraftThread[]): string {
	const live = threads
		.map((thread) => ({ ...thread, messages: thread.messages.filter(isReal) }))
		.filter((thread) => thread.messages.length > 0);

	let budget = DRAFT.conversationMaxChars;
	const blocks: string[] = [];

	for (const [index, thread] of live.entries()) {
		const take =
			index === 0 ? DRAFT.messagesPerThread : DRAFT.earlierThreadMessages;
		const recent = thread.messages.slice(-take).reverse();
		const kept: string[] = [];

		for (const [position, message] of recent.entries()) {
			const entry = render(message, index === 0 && position === 0);
			if (entry.length > budget) break;
			budget -= entry.length;
			kept.unshift(entry);
		}

		if (kept.length === 0) break;

		const label =
			index === 0
				? "CURRENT THREAD, continue this one"
				: "EARLIER THREAD, background only";
		blocks.push(
			`${label}\nSubject: ${thread.subject ?? "(no subject)"}\n${kept.join("\n\n")}`,
		);
	}

	return blocks.join("\n\n===\n\n");
}

function lastMessage(threads: DraftThread[]): DraftMessage | null {
	const current = threads.find((thread) => thread.messages.some(isReal));

	return current?.messages.filter(isReal).at(-1) ?? null;
}

function timing(today: Date, last: DraftMessage | null): string {
	const lines = [`Today is ${day(today)}.`];
	if (!last) return lines.join(" ");

	const days = Math.max(
		0,
		Math.floor((today.getTime() - last.sentAt.getTime()) / DRAFT.dayMs),
	);
	lines.push(`The last message is ${days} days old.`);
	if (days >= DRAFT.staleAfterDays) {
		lines.push(
			"That is a while ago. Reopen the conversation naturally in a few words that fit the time that passed. Never answer it as if it had just arrived.",
		);
	}

	return lines.join(" ");
}

export function draftPrompt(input: DraftPromptInput) {
	const last = lastMessage(input.threads);
	const language = last ? guessLanguage([messageText(last)]) : null;
	const fromContact = input.threads.flatMap((thread) =>
		thread.messages
			.filter((message) => message.direction === "INBOUND" && isReal(message))
			.map(messageText),
	);

	const system = [
		"You write one short email from the sender to one contact. It continues their email conversation.",
		UNTRUSTED_RULE,
		"Read the current thread first. The email picks up the last message in it and refers concretely to what was last discussed, in your own words.",
		"When the contact wrote last, answer what he wrote. When the sender wrote last and got no answer, follow up on exactly that point.",
		"Never quote the conversation and never paste a sentence out of it.",
		"Earlier threads are background. Mention them only when the current thread leads there.",
		language
			? `Write in ${language}, the language of the last message.`
			: "Write in the language of the last message in the current thread.",
		"The subject continues the current thread: keep its subject, with the reply prefix of its language. Never write a new generic subject.",
		"Never invent a fact. Never state an old price, quantity or date as if it still held. Name the topic instead.",
		"Never promise, confirm or change anything the sender has not committed to in his own messages: no discount, no price, no delivery date, no bank details or IBAN change, no contract. When the contact asks for one, say the sender will check and come back.",
		timing(input.today, last),
		"Report the role of the contact: seller when the contact sells or supplies to the business, buyer when the contact buys from it, unclear when the conversation does not say. The role never adds a sentence to the email.",
		"Write the way the sender writes, as his own emails below show: his greeting, his form of address, his length, his sign off. Without such emails, write plain and short and take the form of address from the thread.",
		"Never switch between du and Sie inside the email. Never use a first name when the thread uses surnames, unless the sender himself does.",
		"A German greeting ends with a comma, so the next sentence starts lower case.",
		"Close with the sign off and the sender name. Write no signature block and no contact details under it.",
		"Write plain sentences. Never use a bullet list or a numbered list.",
		"Never use the characters em dash, en dash, horizontal bar or figure dash anywhere in the text.",
		"Never use an emoji or a decorative symbol, in the subject or in the body.",
		"Never write the stock lines of automated sales mail: 'I hope this email finds you well', 'I just wanted to touch base', 'Ich hoffe, diese Nachricht erreicht Sie wohlauf', 'Ich möchte mich nach der aktuellen Lage bei Ihnen erkundigen'.",
		"The email reads as if the sender typed it himself between two other mails. It never reads as a system writing to a lead.",
		voiceSection(input.voice, fromContact),
		avoidSection(input.previous, input.voice.toContact),
		input.style,
		input.playbook,
		...input.business,
	]
		.filter(Boolean)
		.join("\n");

	const prompt = `${input.facts}\n\nThe conversation, current thread first. Continue the current thread. Do not quote it:\n\n${untrusted(conversation(input.threads))}`;

	return { system, prompt };
}
