import type { MailboxProviderId } from "@crm/auth/scopes";
import { type SignInErrorText, signInErrorText } from "@/lib/sign-in-errors";

export const GRANT_ACCESS_COPY = {
	google:
		"This CRM reads your Gmail and Calendar so meetings and email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.",
	microsoft:
		"This CRM reads your Outlook mail so email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.",
} as const satisfies Record<MailboxProviderId, string>;

export const GRANT_ACCESS_COPY_BOTH =
	"This CRM reads your mail and calendar so meetings and email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.";

export const GRANT_ACCESS = {
	path: "/grant-access",
	returned: { param: "returned", value: "1" },
} as const;

export const GRANT_ACCESS_INCOMPLETE = {
	google:
		"Google gave no access to Gmail and Calendar. Grant access again and tick both boxes.",
	microsoft:
		"Microsoft gave no access to your mail. Grant access again and accept the mail permission.",
} as const satisfies Record<MailboxProviderId, string>;

export const GRANT_ACCESS_INCOMPLETE_BOTH =
	"The provider gave no access to your mail. Grant access again and accept every permission it asks for.";

export function grantAccessReturnPath(): string {
	const query = new URLSearchParams({
		[GRANT_ACCESS.returned.param]: GRANT_ACCESS.returned.value,
	});
	return `${GRANT_ACCESS.path}?${query}`;
}

type QueryValue = string | string[] | undefined;

function single(value: QueryValue): string | undefined {
	return Array.isArray(value) ? undefined : value;
}

export function grantAccessNotice(input: {
	error?: QueryValue;
	returned?: QueryValue;
	providers: readonly MailboxProviderId[];
}): SignInErrorText | undefined {
	const failure = signInErrorText(single(input.error));
	if (failure) return failure;

	if (single(input.returned) !== GRANT_ACCESS.returned.value) return undefined;
	if (input.providers.length === 0) return undefined;

	const only = input.providers.length === 1 ? input.providers[0] : undefined;
	return {
		label: only ? GRANT_ACCESS_INCOMPLETE[only] : GRANT_ACCESS_INCOMPLETE_BOTH,
	};
}
