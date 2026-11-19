import { z } from "zod";

export const replyAdoptionCursor = z.object({
	v: z.literal(1),
	day: z.iso.date(),
	created: z.number().int().min(0),
	at: z.iso.datetime().nullable(),
	id: z.string().min(1).nullable(),
	restUntil: z.iso.datetime().nullable(),
});

export type ReplyAdoptionCursor = z.infer<typeof replyAdoptionCursor>;

export type ReplyAdoptionPosition = { at: string; id: string };

export function replyPositionOf(
	cursor: ReplyAdoptionCursor,
): ReplyAdoptionPosition | null {
	if (!cursor.at || !cursor.id) return null;
	return { at: cursor.at, id: cursor.id };
}

export function dayOf(now: Date): string {
	return now.toISOString().slice(0, 10);
}

export function freshReplyAdoptionCursor(now: Date): ReplyAdoptionCursor {
	return {
		v: 1,
		day: dayOf(now),
		created: 0,
		at: null,
		id: null,
		restUntil: null,
	};
}

export function onDay(
	cursor: ReplyAdoptionCursor,
	now: Date,
): ReplyAdoptionCursor {
	const day = dayOf(now);
	return cursor.day === day ? cursor : { ...cursor, day, created: 0 };
}

export type ReplyAdoptionCursorRead =
	| { outcome: "none" }
	| { outcome: "ok"; cursor: ReplyAdoptionCursor }
	| { outcome: "unreadable"; reason: string };

export function readReplyAdoptionCursor(
	raw: string | null | undefined,
): ReplyAdoptionCursorRead {
	if (!raw) return { outcome: "none" };

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (error) {
		return {
			outcome: "unreadable",
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	const parsed = replyAdoptionCursor.safeParse(json);
	if (!parsed.success) {
		return { outcome: "unreadable", reason: parsed.error.message };
	}

	return { outcome: "ok", cursor: parsed.data };
}

export function serialiseReplyAdoptionCursor(
	cursor: ReplyAdoptionCursor,
): string {
	return JSON.stringify(cursor);
}
