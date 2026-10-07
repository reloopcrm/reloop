import { type MailboxProviderId, SYNC_SCOPES_FOR } from "@crm/auth/scopes";

export type MailboxLinkMode = "connect" | "reconnect";

export const RECONNECTED_PARAM = "reconnected";

export type MailboxLinkRequest = {
	provider: MailboxProviderId;
	scopes: string[];
	callbackURL: string;
	errorCallbackURL: string;
};

export function mailboxLinkRequest({
	provider,
	slug,
	origin,
	mode,
}: {
	provider: MailboxProviderId;
	slug: string;
	origin: string;
	mode: MailboxLinkMode;
}): MailboxLinkRequest {
	const page = `${origin}/${slug}/settings/connections/${provider}`;

	return {
		provider,
		scopes: [...SYNC_SCOPES_FOR[provider]],
		callbackURL:
			mode === "reconnect" ? `${page}?${RECONNECTED_PARAM}=${provider}` : page,
		errorCallbackURL: `${page}?provider=${provider}`,
	};
}

export function reconnectedOf(
	query: Record<string, string | string[] | undefined>,
	provider: string,
): boolean {
	const value = query[RECONNECTED_PARAM];
	return (Array.isArray(value) ? value[0] : value) === provider;
}
