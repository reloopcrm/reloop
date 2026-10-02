import { stripQuotedHistory } from "@crm/db/message-text";
import {
	PERSON_STORY,
	type PersonStory,
	personStory,
} from "@crm/validation/person-story";
import { clampAtWord } from "@crm/validation/summary-text";
import { z } from "zod";
import { STORY } from "./story-config";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

export type StoryMessage = {
	id: string;
	direction: string;
	fromName: string | null;
	fromEmail: string;
	subject: string | null;
	sentAt: Date;
	body: string | null;
	snippet: string | null;
};

export type StoryDeal = {
	name: string;
	stage: string;
	amount: string | null;
	currency: string | null;
	closedAt: Date | null;
	createdAt: Date;
};

export type StoryPromptInput = {
	today: Date;
	writtenIn: string;
	person: string;
	company: string | null;
	business: string;
	memory: string | null;
	deals: StoryDeal[];
	messages: StoryMessage[];
	previous: PersonStory | null;
};

export type NumberedMessage = { id: string; text: string };

const reference = z.number().int().min(1);

export function undashed(value: string): string {
	return value.replace(/\s+[–—―]\s+/g, ", ").replace(/[–—―]/g, "-");
}

function text(max: number) {
	return z.string().transform((value) => clampAtWord(undashed(value), max));
}

const answerShape = z.object({
	gist: z
		.string()
		.max(PERSON_STORY.gistMaxChars)
		.describe("One or two sentences: who this is and why they matter now."),
	together: z
		.object({
			text: z.string().max(PERSON_STORY.partMaxChars),
			messages: z.array(reference).max(PERSON_STORY.evidenceMax),
		})
		.nullable()
		.describe("What you did together. Null when the mail shows nothing."),
	stopped: z
		.object({
			text: z.string().max(PERSON_STORY.partMaxChars),
			quote: z
				.object({
					message: reference,
					text: z.string().max(PERSON_STORY.quoteMaxChars),
				})
				.nullable(),
			after: z.string().max(PERSON_STORY.partMaxChars),
			messages: z.array(reference).max(PERSON_STORY.evidenceMax),
		})
		.nullable()
		.describe("When and why the conversation stopped."),
	bringBack: z
		.object({
			text: z.string().max(PERSON_STORY.partMaxChars),
			points: z
				.array(z.string().max(PERSON_STORY.pointMaxChars))
				.max(PERSON_STORY.pointsMax),
			messages: z.array(reference).max(PERSON_STORY.evidenceMax),
		})
		.nullable()
		.describe("What can bring them back, with short points."),
	passages: z
		.array(
			z.object({
				message: reference,
				text: z.string().max(PERSON_STORY.quoteMaxChars),
			}),
		)
		.max(PERSON_STORY.passagesMax)
		.describe("The exact sentences the story is built on."),
});

export const storyAnswerShape = answerShape;

export const storyAnswer = z.object({
	gist: text(PERSON_STORY.gistMaxChars),
	together: z
		.object({
			text: text(PERSON_STORY.partMaxChars),
			messages: z.array(reference).catch([]),
		})
		.nullable()
		.catch(null),
	stopped: z
		.object({
			text: text(PERSON_STORY.partMaxChars),
			quote: z
				.object({ message: reference, text: z.string() })
				.nullable()
				.catch(null),
			after: text(PERSON_STORY.partMaxChars).catch(""),
			messages: z.array(reference).catch([]),
		})
		.nullable()
		.catch(null),
	bringBack: z
		.object({
			text: text(PERSON_STORY.partMaxChars),
			points: z
				.array(text(PERSON_STORY.pointMaxChars))
				.transform((list) => list.slice(0, PERSON_STORY.pointsMax))
				.catch([]),
			messages: z.array(reference).catch([]),
		})
		.nullable()
		.catch(null),
	passages: z
		.array(z.object({ message: reference, text: z.string() }))
		.catch([]),
});

export type StoryAnswer = z.infer<typeof storyAnswer>;

export function messageText(message: StoryMessage): string {
	return stripQuotedHistory(message.body ?? message.snippet ?? "").slice(
		0,
		STORY.bodyMaxChars,
	);
}

export function numberMessages(messages: StoryMessage[]): NumberedMessage[] {
	const ordered = [...messages]
		.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
		.map((message) => ({ message, text: messageText(message) }))
		.filter((entry) => entry.text.trim().length > 0)
		.slice(-STORY.messages);

	let total = 0;
	const kept: typeof ordered = [];
	for (const entry of [...ordered].reverse()) {
		total += entry.text.length;
		if (total > STORY.transcriptMaxChars && kept.length > 0) break;
		kept.unshift(entry);
	}

	return kept.map((entry) => ({ id: entry.message.id, text: entry.text }));
}

function day(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function transcript(
	messages: StoryMessage[],
	numbered: NumberedMessage[],
): string {
	const byId = new Map(messages.map((message) => [message.id, message]));

	return numbered
		.map((entry, index) => {
			const message = byId.get(entry.id);
			if (!message) return "";
			const who =
				message.direction === "OUTBOUND"
					? "WE"
					: `THEY (${message.fromName ?? message.fromEmail})`;
			const subject = message.subject ? ` Subject: ${message.subject}` : "";
			return `${index + 1}. [${day(message.sentAt)}] ${who}.${subject}\n${entry.text}`;
		})
		.join("\n\n---\n\n");
}

function dealLines(deals: StoryDeal[]): string {
	if (deals.length === 0) return "No deals are recorded.";

	return deals
		.slice(0, STORY.deals)
		.map((deal) =>
			[
				`- ${deal.name}`,
				`stage ${deal.stage}`,
				deal.amount ? `${deal.amount} ${deal.currency ?? ""}`.trim() : "",
				deal.closedAt
					? `closed ${day(deal.closedAt)}`
					: `opened ${day(deal.createdAt)}`,
			]
				.filter(Boolean)
				.join(", "),
		)
		.join("\n");
}

function previousSection(previous: PersonStory | null): string {
	if (!previous) return "";

	return [
		"The rep said the previous story is wrong. Read every message again.",
		"Keep a claim from it only when a message clearly supports it.",
		`Previous story:\n${JSON.stringify(previous)}`,
	].join("\n");
}

export function storyPrompt(
	input: StoryPromptInput,
	numbered: NumberedMessage[],
) {
	const system = [
		"You write the story of one quiet customer for a sales rep who wants to win them back.",
		"The rep opens this person and must understand them in under a minute before writing to them.",
		UNTRUSTED_RULE,
		`Write gist, every text, every point and after in ${input.writtenIn}. Address the rep as you, in the informal form. Call the customer by their first name.`,
		"A quote and a passage are copied word for word from the numbered message, in its own language. Never translate or shorten a quote inside the words.",
		"Use only what the messages and the deals say. Never invent a fact, a date, a price or a feeling. When the mail does not show a part, set that part to null.",
		"gist: at most two short sentences. What you did together and why they went quiet. No greeting, no advice.",
		"together: what you did together, the orders, projects and what went well. Name numbers the mail names.",
		"stopped: when and why the conversation stopped, then the one sentence of theirs that shows it best as quote, then after: one or two sentences on what happened after it.",
		"bringBack: what can bring them back now, then up to four short points, each one fact from the mail.",
		"messages: the numbers of the messages each part is built on. A part with no message is null.",
		"passages: up to eight sentences, copied word for word, that the story builds on. The quote is one of them.",
		"Write dates with the month as a word. Write no dash between words or numbers; use a comma, a full stop or the word for to.",
		"Plain words, short sentences, present or past tense. No marketing words.",
	].join("\n");

	const prompt = [
		`Today is ${day(input.today)}.`,
		`The customer: ${input.person}${input.company ? ` at ${input.company}` : ""}.`,
		input.business,
		`Deals with them:\n${dealLines(input.deals)}`,
		input.memory
			? `What the rep's memory says:\n${untrusted(input.memory)}`
			: "",
		previousSection(input.previous),
		`The messages, oldest first:\n${untrusted(transcript(input.messages, numbered))}`,
	]
		.filter(Boolean)
		.join("\n\n");

	return { system, prompt };
}

function normal(value: string): string {
	return value
		.toLowerCase()
		.replace(/[„“”"«»‚‘’']/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function quoted(
	numbered: NumberedMessage[],
	entry: { message: number; text: string },
): { messageId: string; text: string } | null {
	const message = numbered[entry.message - 1];
	const text = entry.text.trim().replace(/^[„“”"«»]+|[„“”"«»]+$/g, "");
	if (!message || text.length === 0) return null;
	if (text.length > PERSON_STORY.quoteMaxChars) return null;
	if (!normal(message.text).includes(normal(text))) return null;

	return { messageId: message.id, text };
}

function ids(numbered: NumberedMessage[], references: number[]): string[] {
	return [
		...new Set(
			references.flatMap((reference) => {
				const message = numbered[reference - 1];
				return message ? [message.id] : [];
			}),
		),
	].slice(0, PERSON_STORY.evidenceMax);
}

export function storyFromAnswer(
	answer: StoryAnswer,
	numbered: NumberedMessage[],
): PersonStory {
	const together = answer.together
		? {
				text: answer.together.text,
				evidenceMessageIds: ids(numbered, answer.together.messages),
			}
		: null;
	const quote = answer.stopped?.quote
		? quoted(numbered, answer.stopped.quote)
		: null;
	const stopped = answer.stopped
		? {
				text: answer.stopped.text,
				quote,
				after: answer.stopped.after,
				evidenceMessageIds: ids(numbered, [
					...answer.stopped.messages,
					...(answer.stopped.quote ? [answer.stopped.quote.message] : []),
				]),
			}
		: null;
	const bringBack = answer.bringBack
		? {
				text: answer.bringBack.text,
				points: answer.bringBack.points.filter(
					(point) => point.trim().length > 0,
				),
				evidenceMessageIds: ids(numbered, answer.bringBack.messages),
			}
		: null;

	const passages = [
		...(quote ? [quote] : []),
		...answer.passages.flatMap((entry) => {
			const found = quoted(numbered, entry);
			return found ? [found] : [];
		}),
	]
		.filter(
			(entry, index, list) =>
				list.findIndex(
					(other) =>
						other.messageId === entry.messageId && other.text === entry.text,
				) === index,
		)
		.slice(0, PERSON_STORY.passagesMax);

	return personStory.parse({
		v: PERSON_STORY.version,
		gist: answer.gist,
		together:
			together && together.text.trim() && together.evidenceMessageIds.length
				? together
				: null,
		stopped:
			stopped && stopped.text.trim() && stopped.evidenceMessageIds.length
				? stopped
				: null,
		bringBack:
			bringBack && bringBack.text.trim() && bringBack.evidenceMessageIds.length
				? bringBack
				: null,
		passages,
	});
}
