export const THEME = {
	app: { defaultTheme: "dark", storageKey: "theme" },
	site: { defaultTheme: "system", storageKey: "reloop-site-theme" },
	siteSegments: ["(landing)", "/_not-found"],
} as const;

export type ThemeScope = (typeof THEME)["app" | "site"];

const SITE_SEGMENTS: readonly string[] = THEME.siteSegments;

export function themeForSegment(segment: string | null): ThemeScope {
	return segment !== null && SITE_SEGMENTS.includes(segment)
		? THEME.site
		: THEME.app;
}
