import { z } from "zod";

export const threadContactsCursor = z.object({
	v: z.literal(1),
	at: z.iso.datetime(),
	id: z.string().min(1),
});

export type ThreadContactsCursor = z.infer<typeof threadContactsCursor>;

export type ThreadContactsCursorRead =
	| { outcome: "none" }
	| { outcome: "ok"; cursor: ThreadContactsCursor }
	| { outcome: "unreadable"; reason: string };

export function readThreadContactsCursor(
	raw: string | null | undefined,
): ThreadContactsCursorRead {
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

	const parsed = threadContactsCursor.safeParse(json);
	if (!parsed.success) {
		return { outcome: "unreadable", reason: parsed.error.message };
	}

	return { outcome: "ok", cursor: parsed.data };
}

export function serialiseThreadContactsCursor(
	cursor: ThreadContactsCursor,
): string {
	return JSON.stringify(cursor);
}
