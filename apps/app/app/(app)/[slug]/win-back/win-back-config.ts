const DAY_MS = 86_400_000;

export const WIN_BACK_UI = {
	remindLater: { afterDays: 7, returnDay: { day: "numeric", month: "long" } },
	quickFilter: { quietForDays: 30 },
	bulkVerdict: { maxContactsPerCall: 200 },
	person: {
		pollMs: 3_000,
		highlightMs: 2_400,
		dayMs: DAY_MS,
		trackLeadDays: 20,
		storySeconds: 15,
		shorter:
			"Make this one email shorter: two or three sentences. Keep the facts, the question and the sign-off. This wish is for this email only, not a lasting rule.",
	},
} as const;
