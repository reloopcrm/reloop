export type MailboxLink = {
	mailboxUrl: string | null;
	mailboxName: "Gmail" | "Outlook" | null;
};

export function mailboxLinkOf(message: {
	gmailMessageId: string | null;
	outlookWebLink: string | null;
}): MailboxLink {
	if (message.gmailMessageId) {
		return {
			mailboxUrl: `https://mail.google.com/mail/u/0/#all/${message.gmailMessageId}`,
			mailboxName: "Gmail",
		};
	}

	return message.outlookWebLink
		? { mailboxUrl: message.outlookWebLink, mailboxName: "Outlook" }
		: { mailboxUrl: null, mailboxName: null };
}
