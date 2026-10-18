export const POSTHOG_HOST =
	process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
export const POSTHOG_UI_HOST =
	process.env.POSTHOG_UI_HOST ?? "https://eu.posthog.com";

export function posthogKey(): string {
	return process.env.POSTHOG_KEY ?? "";
}
