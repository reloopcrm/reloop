import { z } from "zod";

export const calendarPageCursor = z.object({
	v: z.literal(1),
	pageToken: z.string().min(1),
	syncToken: z.string().nullable(),
	timeMin: z.iso.datetime(),
	timeMax: z.iso.datetime(),
});

export type CalendarPageCursor = z.infer<typeof calendarPageCursor>;

export type CalendarPageRead =
	| { outcome: "none" }
	| { outcome: "ok"; cursor: CalendarPageCursor }
	| { outcome: "unreadable"; reason: string };

export function readCalendarPage(
	raw: string | null | undefined,
): CalendarPageRead {
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

	const parsed = calendarPageCursor.safeParse(json);
	if (!parsed.success) {
		return { outcome: "unreadable", reason: parsed.error.message };
	}

	return { outcome: "ok", cursor: parsed.data };
}

export function serialiseCalendarPage(cursor: CalendarPageCursor): string {
	return JSON.stringify(cursor);
}
