const SECOND_MS = 1_000;

export const CHECKOUT = {
	param: "checkout",
	outcome: { success: "success", cancel: "cancel" },
	poll: { intervalMs: 2 * SECOND_MS, maxMs: 90 * SECOND_MS },
} as const;
