import { z } from "zod";

export const threadAdoptionCursor = z.object({
	v: z.literal(1),
	at: z.iso.datetime(),
	id: z.string().min(1),
});

export type ThreadAdoptionCursor = z.infer<typeof threadAdoptionCursor>;

export type ThreadAdoptionCursorRead =
	| { outcome: "none" }
	| { outcome: "ok"; cursor: ThreadAdoptionCursor }
	| { outcome: "unreadable"; reason: string };

export function readThreadAdoptionCursor(
	raw: string | null | undefined,
): ThreadAdoptionCursorRead {
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

	const parsed = threadAdoptionCursor.safeParse(json);
	if (!parsed.success) {
		return { outcome: "unreadable", reason: parsed.error.message };
	}

	return { outcome: "ok", cursor: parsed.data };
}

export function serialiseThreadAdoptionCursor(
	cursor: ThreadAdoptionCursor | null,
): string | null {
	return cursor ? JSON.stringify(cursor) : null;
}
