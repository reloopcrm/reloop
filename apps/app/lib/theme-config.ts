export const THEME = {
	app: { defaultTheme: "dark", storageKey: "theme" },
	site: { defaultTheme: "system", storageKey: "reloop-site-theme" },
	siteSegments: ["(landing)", "/_not-found"],
	authSegments: ["sign-in", "onboarding", "grant-access"],
} as const;

export type ThemeScope = (typeof THEME)["app" | "site"];

const SITE_SEGMENTS: readonly string[] = THEME.siteSegments;
const AUTH_SEGMENTS: readonly string[] = THEME.authSegments;

export function themeForSegments(segments: readonly string[]): ThemeScope {
	const [group, page] = segments;
	if (group === undefined || !SITE_SEGMENTS.includes(group)) return THEME.app;
	return page !== undefined && AUTH_SEGMENTS.includes(page)
		? THEME.app
		: THEME.site;
}
