import type { Translate } from "./i18n/locale";

export const BUILDER_STEPS = [
	"Scope",
	"Instructions",
	"Manifest",
	"Review",
] as const;

export const BUILDER_FOLLOW_UPS = [
	"Add another teammate to the notification",
] as const;

export const DELIVERY_ERROR_FALLBACK = "This message could not be sent.";

export const DELIVERY_ERRORS: Record<string, string> = {
	DELIVERY_FAILED:
		"The builder did not receive this message. Send it again in a moment.",
	DELIVERY_EXHAUSTED:
		"The builder could not take this message after three attempts. Send it again.",
};

export function deliveryErrorText(
	code: string | null | undefined,
	t: Translate,
): string {
	const known = code ? DELIVERY_ERRORS[code] : undefined;
	return t(known ?? DELIVERY_ERROR_FALLBACK);
}
