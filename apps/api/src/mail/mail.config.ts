const SECOND_MS = 1_000;

export const MAIL = {
	resend: { url: "https://api.resend.com/emails", timeoutMs: 10 * SECOND_MS },
} as const;
