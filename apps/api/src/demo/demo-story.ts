import { EmailDirection } from "@crm/db";
import { LOCALE } from "@crm/db/locale";
import {
	PERSON_STORY,
	type PersonStory,
	personStory,
} from "@crm/validation/person-story";
import { clampAtWord } from "@crm/validation/summary-text";
import type { DemoCopy } from "./demo-copy";

export type StoryMessage = {
	id: string;
	direction: EmailDirection;
	body: string;
};

export type StoryThread = {
	kind: string;
	product: string;
	qty: string;
	hasQty: boolean;
	ref: string;
	subject: string;
	endDaysAgo: number;
	lastAt: Date;
	messages: StoryMessage[];
};

export const STORY_TEXTS = {
	togetherOnce: "{name} ordered once from you, in {month}: {products}.",
	togetherMany:
		"{name} ordered {count} times from you, last in {month}: {products}.",
	togetherNone:
		"You wrote with {name} about {products}. No order has come of it yet.",
	stoppedInquiry: "On {date} {name} sent a request for {product}, {qty}.",
	stoppedOffer: "On {date} you sent offer {ref} for {product}.",
	stoppedOrder: "The last order, {ref}, came on {date}.",
	stoppedOther: "The last conversation was on {date}: {subject}.",
	afterTheirs: "Nobody answered that mail. {name} has not written since.",
	afterOurs:
		"Your answer was the last mail. Since then {days} days have passed without a word.",
	backWaiting:
		"{name} asked first and is still waiting. A late but honest answer with a price can restart it.",
	backOffer:
		"Your offer is on the table. A short question whether it still fits brings the decision back.",
	backOrders:
		"The orders went well. A note before the next season keeps you first in line.",
	backOther:
		"The last contact was friendly and practical. A short question about the next need is enough.",
	pointOrders: "{count} orders went through.",
	pointOrder: "One order went through.",
	pointOpen: "The request for {qty} of {product} is still open.",
	pointClaim: "A damaged delivery was replaced at no charge.",
	pointDays: "The last mail was {days} days ago.",
} as const;

const ORDER_KINDS = new Set(["deal", "winback"]);

function sentences(text: string): string[] {
	return text
		.split(/(?<=[.?!])\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function withoutGreeting(sentence: string): string {
	return sentence.replace(
		/^(hello|hi|hallo|liebe|lieber|dear)\s+[^,]+,\s*/i,
		"",
	);
}

function capital(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function telling(body: string): string | null {
	const found = sentences(body)
		.map(withoutGreeting)
		.find((sentence) => sentence.split(/\s+/).length >= 6);
	if (!found || found.length > PERSON_STORY.quoteMaxChars) return null;
	return capital(found);
}

function gistOf(summary: string): string {
	const parts = sentences(summary);
	const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
	return clampAtWord(picked.join(" "), PERSON_STORY.gistMaxChars);
}

function lastTheirs(thread: StoryThread): StoryMessage | undefined {
	return [...thread.messages]
		.reverse()
		.find((message) => message.direction === EmailDirection.INBOUND);
}

export function demoStory(input: {
	copy: DemoCopy;
	name: string;
	summary: string;
	threads: StoryThread[];
}): PersonStory {
	const { copy, name } = input;
	const t = copy.t;
	const tag = LOCALE.tags[copy.locale];
	const day = (date: Date) =>
		date.toLocaleDateString(tag, { day: "numeric", month: "long" });
	const month = (date: Date) =>
		date.toLocaleDateString(tag, { month: "long", year: "numeric" });

	const byAge = [...input.threads].sort((a, b) => a.endDaysAgo - b.endDaysAgo);
	const latest = byAge[0];
	if (!latest) throw new Error(`No thread to tell ${name}'s story from`);

	const orders = byAge.filter((thread) => ORDER_KINDS.has(thread.kind));
	const products = [
		...new Set(
			(orders.length ? orders : byAge).map((thread) => thread.product),
		),
	]
		.slice(0, 3)
		.join(", ");
	const togetherSources = (orders.length ? orders : byAge)
		.map((thread) => thread.messages[0]?.id)
		.filter((id): id is string => Boolean(id));
	const newestOrder = orders[0];
	const together = {
		text: newestOrder
			? orders.length === 1
				? t(STORY_TEXTS.togetherOnce, {
						name,
						month: month(newestOrder.lastAt),
						products,
					})
				: t(STORY_TEXTS.togetherMany, {
						name,
						count: copy.number(orders.length),
						month: month(newestOrder.lastAt),
						products,
					})
			: t(STORY_TEXTS.togetherNone, { name, products }),
		evidenceMessageIds: togetherSources.slice(0, PERSON_STORY.evidenceMax),
	};

	const theirs = lastTheirs(latest);
	const quoteText = theirs ? telling(theirs.body) : null;
	const quote =
		theirs && quoteText ? { messageId: theirs.id, text: quoteText } : null;
	const lastMessage = latest.messages[latest.messages.length - 1];
	const unanswered = lastMessage?.direction === EmailDirection.INBOUND;
	const vars = {
		name,
		date: day(latest.lastAt),
		product: latest.product,
		qty: latest.qty,
		ref: latest.ref,
		subject: latest.subject,
		days: copy.number(latest.endDaysAgo),
	};
	const stoppedText =
		latest.kind === "inquiry"
			? t(STORY_TEXTS.stoppedInquiry, vars)
			: latest.kind === "followup"
				? t(STORY_TEXTS.stoppedOffer, vars)
				: ORDER_KINDS.has(latest.kind)
					? t(STORY_TEXTS.stoppedOrder, vars)
					: t(STORY_TEXTS.stoppedOther, vars);
	const stopped = {
		text: stoppedText,
		quote,
		after: unanswered
			? t(STORY_TEXTS.afterTheirs, vars)
			: t(STORY_TEXTS.afterOurs, vars),
		evidenceMessageIds: latest.messages
			.map((message) => message.id)
			.slice(0, PERSON_STORY.evidenceMax),
	};

	const openInquiry = byAge.find(
		(thread) => thread.kind === "inquiry" && thread.hasQty,
	);
	const points = [
		orders.length === 1
			? t(STORY_TEXTS.pointOrder)
			: orders.length > 1
				? t(STORY_TEXTS.pointOrders, { count: copy.number(orders.length) })
				: null,
		openInquiry
			? t(STORY_TEXTS.pointOpen, {
					qty: openInquiry.qty,
					product: openInquiry.product,
				})
			: null,
		byAge.some((thread) => thread.kind === "claim")
			? t(STORY_TEXTS.pointClaim)
			: null,
		t(STORY_TEXTS.pointDays, vars),
	].filter((point): point is string => point !== null);
	const bringBack = {
		text:
			latest.kind === "inquiry" && unanswered
				? t(STORY_TEXTS.backWaiting, vars)
				: latest.kind === "inquiry" || latest.kind === "followup"
					? t(STORY_TEXTS.backOffer, vars)
					: ORDER_KINDS.has(latest.kind)
						? t(STORY_TEXTS.backOrders, vars)
						: t(STORY_TEXTS.backOther, vars),
		points: points.slice(0, PERSON_STORY.pointsMax),
		evidenceMessageIds: [
			...(quote ? [quote.messageId] : []),
			...(openInquiry?.messages[0] ? [openInquiry.messages[0].id] : []),
		],
	};

	const firstOrder = orders[orders.length - 1]?.messages.find(
		(message) => message.direction === EmailDirection.INBOUND,
	);
	const orderLine = firstOrder ? telling(firstOrder.body) : null;
	const passages = [
		...(quote ? [quote] : []),
		...(firstOrder && orderLine
			? [{ messageId: firstOrder.id, text: orderLine }]
			: []),
	];

	return personStory.parse({
		v: PERSON_STORY.version,
		gist: gistOf(input.summary),
		together,
		stopped,
		bringBack: bringBack.evidenceMessageIds.length
			? bringBack
			: { ...bringBack, evidenceMessageIds: stopped.evidenceMessageIds },
		passages,
	});
}
