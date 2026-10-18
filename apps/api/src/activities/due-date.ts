const DAY_MS = 24 * 60 * 60_000;

const MIDDAY_MS = 12 * 60 * 60_000;

export function overdueBefore(now: Date): Date {
	return new Date(now.getTime() - DAY_MS);
}

export function dueOnDayOf(instant: Date): Date {
	const day = Date.UTC(
		instant.getUTCFullYear(),
		instant.getUTCMonth(),
		instant.getUTCDate(),
	);

	return new Date(day + MIDDAY_MS);
}
