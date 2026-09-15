const SECOND_MS = 1_000;

export const BUSINESS_STEP = {
	pollMs: 3 * SECOND_MS,
	waitMs: 90 * SECOND_MS,
	next: "/onboarding/ai",
} as const;
