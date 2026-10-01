export const THEME = {
	app: "dark",
	site: "dark",
	siteSegment: "(landing)",
} as const;

export type DefaultTheme = (typeof THEME)["app" | "site"];

export function themeForSegment(segment: string | null): DefaultTheme {
	return segment === THEME.siteSegment ? THEME.site : THEME.app;
}
