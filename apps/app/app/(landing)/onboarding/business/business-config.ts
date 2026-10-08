const SECOND_MS = 1_000;

export const BUSINESS_STEP = {
	pollMs: 3 * SECOND_MS,
	waitMs: 90 * SECOND_MS,
	next: "/onboarding/ai",
} as const;

export type BusinessDraftSource = {
	fixed: boolean;
	openrouterKey: boolean;
	openaiKey: boolean;
	anthropicKey: boolean;
	chatgpt: boolean;
};

export function businessDraftPossible(source: BusinessDraftSource): boolean {
	return (
		source.fixed ||
		source.openrouterKey ||
		source.openaiKey ||
		source.anthropicKey ||
		source.chatgpt
	);
}

export function readingBusinessDraft(input: {
	possible: boolean;
	pending: boolean;
	description: string | undefined;
	elapsedMs: number;
}): boolean {
	if (!input.possible) return false;
	if (input.pending) return true;

	return input.description === "" && input.elapsedMs < BUSINESS_STEP.waitMs;
}
