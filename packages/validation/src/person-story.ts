import { z } from "zod";

export const PERSON_STORY = {
	version: 1,
	gistMaxChars: 320,
	partMaxChars: 600,
	quoteMaxChars: 240,
	pointMaxChars: 160,
	pointsMax: 4,
	passagesMax: 8,
	evidenceMax: 8,
} as const;

const messageId = z.string().trim().min(1).max(64);
const evidenceMessageIds = z.array(messageId).max(PERSON_STORY.evidenceMax);
const part = z.string().trim().min(1).max(PERSON_STORY.partMaxChars);

const passage = z.object({
	messageId,
	text: z.string().trim().min(1).max(PERSON_STORY.quoteMaxChars),
});

export const personStory = z.object({
	v: z.literal(PERSON_STORY.version),
	gist: z.string().trim().min(1).max(PERSON_STORY.gistMaxChars),
	together: z
		.object({
			text: part,
			evidenceMessageIds,
		})
		.nullable(),
	stopped: z
		.object({
			text: part,
			quote: passage.nullable(),
			after: z.string().trim().max(PERSON_STORY.partMaxChars),
			evidenceMessageIds,
		})
		.nullable(),
	bringBack: z
		.object({
			text: part,
			points: z
				.array(z.string().trim().min(1).max(PERSON_STORY.pointMaxChars))
				.max(PERSON_STORY.pointsMax),
			evidenceMessageIds,
		})
		.nullable(),
	passages: z.array(passage).max(PERSON_STORY.passagesMax),
});

export type PersonStory = z.infer<typeof personStory>;

export type PersonStoryPassage = z.infer<typeof passage>;

export type ParsedPersonStory =
	| { ok: true; story: PersonStory }
	| { ok: false; reason: string };

export function parsePersonStory(value: unknown): ParsedPersonStory {
	const parsed = personStory.safeParse(value);
	if (parsed.success) return { ok: true, story: parsed.data };

	return {
		ok: false,
		reason: parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "story"} ${issue.message}`)
			.join("; "),
	};
}

export function storyMessageIds(story: PersonStory): string[] {
	return [
		...new Set([
			...(story.together?.evidenceMessageIds ?? []),
			...(story.stopped?.evidenceMessageIds ?? []),
			...(story.stopped?.quote ? [story.stopped.quote.messageId] : []),
			...(story.bringBack?.evidenceMessageIds ?? []),
			...story.passages.map((entry) => entry.messageId),
		]),
	];
}

export function keepKnownMessages(
	story: PersonStory,
	known: ReadonlySet<string>,
): PersonStory {
	const ids = (list: string[]) => list.filter((id) => known.has(id));
	const quote = story.stopped?.quote ?? null;

	return {
		...story,
		together: story.together
			? {
					...story.together,
					evidenceMessageIds: ids(story.together.evidenceMessageIds),
				}
			: null,
		stopped: story.stopped
			? {
					...story.stopped,
					quote: quote && known.has(quote.messageId) ? quote : null,
					evidenceMessageIds: ids(story.stopped.evidenceMessageIds),
				}
			: null,
		bringBack: story.bringBack
			? {
					...story.bringBack,
					evidenceMessageIds: ids(story.bringBack.evidenceMessageIds),
				}
			: null,
		passages: story.passages.filter((entry) => known.has(entry.messageId)),
	};
}
