import { describe, expect, it } from "bun:test";
import { THEME, themeForSegments } from "../lib/theme-config";

describe("themeForSegments", () => {
	it("keeps the app dark", () => {
		expect(THEME.app.defaultTheme).toBe("dark");
		for (const segments of [[], ["(app)"], ["[slug]", "settings"], ["t"]])
			expect(themeForSegments(segments)).toBe(THEME.app);
	});

	it("lets the public site follow the device", () => {
		expect(THEME.site.defaultTheme).toBe("system");
		for (const group of THEME.siteSegments)
			expect(themeForSegments([group])).toBe(THEME.site);
		expect(themeForSegments(["(landing)", "contact"])).toBe(THEME.site);
	});

	it("keeps sign-in and onboarding in the app scope, so entering the app never switches the theme", () => {
		for (const page of THEME.authSegments)
			expect(themeForSegments(["(landing)", page])).toBe(THEME.app);
		expect(themeForSegments(["(landing)", "onboarding", "ai"])).toBe(THEME.app);
	});

	it("stores the site choice apart from the app choice", () => {
		expect(THEME.site.storageKey).not.toBe(THEME.app.storageKey);
	});
});
