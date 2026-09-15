import type { MailboxProviderId } from "@crm/auth/scopes";

export const GRANT_ACCESS_COPY = {
	google:
		"This CRM reads your Gmail and Calendar so meetings and email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.",
	microsoft:
		"This CRM reads your Outlook mail so email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.",
} as const satisfies Record<MailboxProviderId, string>;

export const GRANT_ACCESS_COPY_BOTH =
	"This CRM reads your mail and calendar so meetings and email threads show up on the right company. It is read-only. Nothing is ever sent on your behalf.";
