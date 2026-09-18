import type { Locale, Translate } from "./locale";

export function translateError(
	t: Translate,
	locale: Locale,
	message: string,
): string {
	const key =
		locale === "en" ? message : message.replace(/\s+[‒–—―]\s+/g, ". ");
	const translated = t(key);
	if (translated !== key || locale === "en") return translated;
	const minimum = /^The password needs at least (\d+) characters\.$/.exec(
		message,
	)?.[1];
	if (minimum)
		return t("The password needs at least {count} characters.", {
			count: minimum,
		});
	const maximum = /^The password takes at most (\d+) characters\.$/.exec(
		message,
	)?.[1];
	if (maximum)
		return t("The password takes at most {count} characters.", {
			count: maximum,
		});
	const outside = /^(\S+@\S+) is not in ALLOWED_SIGN_IN,/.exec(message)?.[1];
	if (outside)
		return t(
			"{email} is not in ALLOWED_SIGN_IN, so this person could not sign in. Add {email} to ALLOWED_SIGN_IN in deploy/.env, then run docker compose up -d in that folder.",
			{ email: outside },
		);
	return t(
		"The request failed. Check your input and connection, then try again.",
	);
}
