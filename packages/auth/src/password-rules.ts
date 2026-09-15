const MINUTE_MS = 60_000;

export const PASSWORD_RULES = {
	freshSessionMs: 5 * MINUTE_MS,
	minLength: 12,
	maxLength: 128,
} as const;

export function isFreshPasswordSession(
	createdAt: Date,
	now = Date.now(),
): boolean {
	const age = now - createdAt.getTime();
	return (
		Number.isFinite(age) && age >= 0 && age <= PASSWORD_RULES.freshSessionMs
	);
}
