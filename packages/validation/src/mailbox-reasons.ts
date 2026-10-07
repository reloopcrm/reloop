export const MAILBOX_PROVIDER_LABELS = ["Google", "Microsoft"] as const;

export type MailboxProviderLabel = (typeof MAILBOX_PROVIDER_LABELS)[number];

export const MAILBOX_RECONNECT_REASONS = {
	noAccessToken: (provider: MailboxProviderLabel) =>
		`${provider} returned no access token.`,
	refreshFailed: (provider: MailboxProviderLabel) =>
		`${provider} would not refresh the access token.`,
} as const;

export const ALL_MAILBOX_RECONNECT_REASONS = MAILBOX_PROVIDER_LABELS.flatMap(
	(provider) =>
		Object.values(MAILBOX_RECONNECT_REASONS).map((reason) => reason(provider)),
);
