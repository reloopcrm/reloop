import { TIMELINE_TABS, type TimelineTab } from "./timeline-search-params";

export const TIMELINE = {
	pinned: { limit: 10 },
	preview: { maxChars: 180 },
	thread: { olderShown: 2 },
	forward: { headChars: 1_500, stepChars: 100 },
	counted: TIMELINE_TABS,
	format: {
		time: { hour: "numeric", minute: "2-digit" },
		day: { weekday: "short", day: "numeric", month: "short" },
		dayShort: { weekday: "short", day: "numeric" },
		weekday: { weekday: "long" },
		date: { day: "numeric", month: "short" },
		dateWithYear: { day: "numeric", month: "short", year: "numeric" },
		range: {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		},
	},
} as const satisfies {
	pinned: { limit: number };
	preview: { maxChars: number };
	thread: { olderShown: number };
	forward: { headChars: number; stepChars: number };
	counted: readonly TimelineTab[];
	format: Record<string, Intl.DateTimeFormatOptions>;
};

export function tabCount(
	tab: TimelineTab,
	counts: Record<TimelineTab, number> | undefined,
): number | null {
	if (!counts) return null;
	if (!TIMELINE.counted.some((counted) => counted === tab)) return null;
	const value = counts[tab];
	return value > 0 ? value : null;
}
