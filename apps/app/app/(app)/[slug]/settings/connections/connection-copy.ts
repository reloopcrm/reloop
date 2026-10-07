export const GOOGLE_CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Google account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Google account that matches your sign-in address.",
	],
]);

export const GOOGLE_CONNECT_ERROR_FALLBACK =
	"Google returned an error before the connection was made. Try again.";

export const MICROSOFT_CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Microsoft account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Microsoft account that matches your sign-in address.",
	],
]);

export const MICROSOFT_CONNECT_ERROR_FALLBACK =
	"Microsoft returned an error before the connection was made. Try again.";

export const SLACK_CONNECT_ERRORS = new Map([
	[
		"access_denied",
		"Slack installation was cancelled before access was granted.",
	],
	[
		"account_already_linked_to_different_user",
		"That Slack installer is already linked to another CRM account.",
	],
	[
		"email_doesn't_match",
		"The Slack installer's email must match the CRM account you are signed in with.",
	],
	[
		"oauth_code_verification_failed",
		"Slack rejected the app credentials or redirect URL. Check the client ID, client secret, and OAuth redirect URL, then try again.",
	],
	[
		"user_info_is_missing",
		"Slack did not return the installer's profile. Confirm the app has users:read and users:read.email, reinstall it, then try again.",
	],
]);

export const SLACK_NEVER = [
	"Send anything at all until you build an automation and switch it on",
	"Post anywhere except the destination approved in that automation",
	"Read a direct message between two people",
];

export const SLACK_SUGGESTIONS = [
	["When a deal is created", "Post the deal to an approved sales channel."],
	["When a deal is won", "Tell an approved channel that the deal closed."],
	["When a deal reopens", "Notify one approved channel or teammate."],
] as const;
