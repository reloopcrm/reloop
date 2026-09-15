const MINUTE_MS = 60_000;

export const WAITLIST = {
	join: { perMinute: 20, resendAfterMs: 10 * MINUTE_MS },
	confirm: { perMinute: 60 },
	token: { bytes: 32, maxAgeMs: 7 * 24 * 60 * MINUTE_MS },
	email: {
		endpoint: "https://api.resend.com/emails",
		timeoutMs: 10_000,
		subject: "Confirm your spot on the Reloop CRM Cloud waitlist",
	},
} as const;
