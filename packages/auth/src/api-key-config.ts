export const API_KEY_HEADER = "x-api-key";
export const API_KEY_PREFIX = "crm_";

export const DAY_SECONDS = 24 * 60 * 60;

export const API_KEY_NO_EXPIRATION = "never";

export const API_KEY_EXPIRATION = {
	minDays: 1,
	maxDays: 365,
	choices: ["30", "90", "365", API_KEY_NO_EXPIRATION],
	defaultChoice: "90",
} as const;

export type ApiKeyExpirationChoice =
	(typeof API_KEY_EXPIRATION.choices)[number];

export function expirationDaysOf(
	choice: ApiKeyExpirationChoice,
): number | null {
	return choice === API_KEY_NO_EXPIRATION ? null : Number(choice);
}
