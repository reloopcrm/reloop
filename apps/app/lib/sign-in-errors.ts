const RETRY = "The sign-in did not finish. Start it again.";
const EXPIRED = "The sign-in took too long. Start it again.";
const TAKEN = "This account already belongs to somebody else here.";
const MISSING = "This way in is not set up on this server.";

export const SIGN_IN_ERRORS = {
	access_denied: "You stopped the sign-in.",
	account_already_linked_to_different_user: TAKEN,
	"email_doesn't_match": "This account uses a different email address.",
	email_not_found: "The provider gave back no email address.",
	internal_server_error: "Something went wrong on the server.",
	invalid_callback_request: RETRY,
	invalid_code: RETRY,
	no_callback_url: RETRY,
	no_code: RETRY,
	oauth_provider_not_found: MISSING,
	provider_not_found: MISSING,
	state_generation_error: "The sign-in could not start. Try again.",
	state_invalid: EXPIRED,
	state_mismatch: EXPIRED,
	state_not_found: EXPIRED,
	too_many_requests: "Too many tries. Wait a moment, then start again.",
	unable_to_get_user_info: "The provider gave back no account details.",
	unable_to_link_account: TAKEN,
} as const;

export const SIGN_IN_ERROR_WITH_CODE =
	"The sign-in did not work. The server says: {code}";

export const SIGN_IN_ERROR_UNREACHABLE = "Could not reach the sign-in service.";

export const TOO_MANY_REQUESTS_STATUS = 429;

export type SignInErrorText =
	| { label: string; vars?: undefined }
	| { label: string; vars: { code: string } };

export function signInErrorText(
	code: string | null | undefined,
): SignInErrorText | undefined {
	const normal = code?.trim().toLowerCase();
	if (!normal) return undefined;

	const known = Object.hasOwn(SIGN_IN_ERRORS, normal)
		? SIGN_IN_ERRORS[normal as keyof typeof SIGN_IN_ERRORS]
		: undefined;

	if (known) return { label: known };

	return { label: SIGN_IN_ERROR_WITH_CODE, vars: { code: normal } };
}

export function signInFailureText(
	failure: { code?: string; status?: number } | undefined,
	unreachable: string = SIGN_IN_ERROR_UNREACHABLE,
): SignInErrorText {
	if (failure?.status === TOO_MANY_REQUESTS_STATUS) {
		return { label: SIGN_IN_ERRORS.too_many_requests };
	}

	return signInErrorText(failure?.code) ?? { label: unreachable };
}
