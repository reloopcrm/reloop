const DAY_MS = 24 * 60 * 60_000;

export function overdueBefore(now: Date): Date {
	return new Date(now.getTime() - DAY_MS);
}
