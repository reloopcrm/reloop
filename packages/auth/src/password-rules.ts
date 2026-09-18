import { API_KEY_PREFIX } from "./api-keys";

const MINUTE_MS = 60_000;

export const PASSWORD_RULES = {
	freshSessionMs: 5 * MINUTE_MS,
	minLength: 12,
	maxLength: 128,
	generatedBytes: 15,
} as const;

export type PasswordSession = { createdAt: Date; token: string };

export function isFreshPasswordSession(
	session: PasswordSession,
	now = Date.now(),
): boolean {
	if (session.token.startsWith(API_KEY_PREFIX)) return false;

	const age = now - session.createdAt.getTime();

	return (
		Number.isFinite(age) && age >= 0 && age <= PASSWORD_RULES.freshSessionMs
	);
}
