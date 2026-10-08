import { type MailboxProviderId, SYNC_SCOPES_FOR } from "@crm/auth/scopes";

export type MailboxLinkMode = "connect" | "reconnect";

export const RECONNECTED_PARAM = "reconnected";

const RECONNECT_PROMPT = {
	google: "select_account consent",
	microsoft: null,
} as const satisfies Record<MailboxProviderId, string | null>;

export type MailboxLinkRequest = {
	provider: MailboxProviderId;
	scopes: string[];
	callbackURL: string;
	errorCallbackURL: string;
	disableRedirect: boolean;
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
		disableRedirect: mode === "reconnect",
	};
}

export function reconnectAuthorizationUrl(
	provider: MailboxProviderId,
	url: string,
): string {
	const prompt = RECONNECT_PROMPT[provider];
	if (!prompt) return url;

	const next = new URL(url);
	next.searchParams.set("prompt", prompt);
	return next.toString();
}

export function withoutReconnectedMarker(
	pathname: string,
	search: string,
	hash = "",
): string {
	const query = new URLSearchParams(search);
	query.delete(RECONNECTED_PARAM);
	const rest = query.toString();
	return `${pathname}${rest ? `?${rest}` : ""}${hash}`;
}

export function reconnectedOf(
	query: Record<string, string | string[] | undefined>,
	provider: string,
): boolean {
	const value = query[RECONNECTED_PARAM];
	return (Array.isArray(value) ? value[0] : value) === provider;
}
