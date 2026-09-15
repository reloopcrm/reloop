const SECOND_MS = 1_000;
const HOUR_MS = 3_600 * SECOND_MS;

export const MAILBOX_SYNC = {
	heartbeat: { minIntervalMs: 15 * SECOND_MS },
	rates: { everyMs: 24 * HOUR_MS },
} as const;

export type TimerEnvironment = {
	vercel: string | undefined;
	nodeEnv: string | undefined;
	mailboxIntervalMs: number | undefined;
};

export function selfHostTimers(environment: TimerEnvironment) {
	if (environment.vercel) return { mailboxEveryMs: null, ratesEveryMs: null };

	const mailbox = environment.mailboxIntervalMs ?? 0;

	return {
		mailboxEveryMs:
			mailbox > 0
				? Math.max(mailbox, MAILBOX_SYNC.heartbeat.minIntervalMs)
				: null,
		ratesEveryMs:
			environment.nodeEnv === "production" ? MAILBOX_SYNC.rates.everyMs : null,
	};
}
