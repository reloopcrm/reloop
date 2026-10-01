export const THEME = {
	app: { defaultTheme: "dark", storageKey: "theme" },
	site: { defaultTheme: "system", storageKey: "reloop-site-theme" },
	siteSegments: ["(landing)", "/_not-found"],
} as const;

export type ThemeScope = (typeof THEME)["app" | "site"];

const SITE_SEGMENTS: readonly string[] = THEME.siteSegments;

export function themeForSegments(segments: readonly string[]): ThemeScope {
	const [group] = segments;
	return group !== undefined && SITE_SEGMENTS.includes(group)
		? THEME.site
		: THEME.app;
}
