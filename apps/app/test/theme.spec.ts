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

	it("puts sign-in, onboarding and grant access on the site", () => {
		for (const page of ["sign-in", "onboarding", "grant-access"])
			expect(themeForSegments(["(landing)", page])).toBe(THEME.site);
		expect(themeForSegments(["(landing)", "onboarding", "ai"])).toBe(
			THEME.site,
		);
	});

	it("stores the site choice apart from the app choice", () => {
		expect(THEME.site.storageKey).not.toBe(THEME.app.storageKey);
	});
});
