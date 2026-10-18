const DAY_MS = 24 * 60 * 60 * 1000;

export const DEALS = {
	board: {
		columnLimit: 50,
		recentClosed: 3,
		closedWindowMs: 90 * DAY_MS,
	},
} as const;
