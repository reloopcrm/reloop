const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const CALENDAR = {
	sync: {
		maxPagesPerTick: 5,
		pageSize: 250,
		horizonMs: 180 * DAY_MS,
	},
	meetingPrep: {
		soonMs: 7 * DAY_MS,
	},
} as const;
