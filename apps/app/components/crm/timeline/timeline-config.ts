export const TIMELINE = {
	pinned: { limit: 10 },
	preview: { maxChars: 180 },
	format: {
		time: { hour: "numeric", minute: "2-digit" },
		day: { weekday: "short", day: "numeric", month: "short" },
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
	format: Record<string, Intl.DateTimeFormatOptions>;
};
