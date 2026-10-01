import { describe, expect, it } from "bun:test";
import { THEME, themeForSegment } from "../lib/theme-config";

describe("themeForSegment", () => {
	it("keeps the app dark", () => {
		expect(THEME.app.defaultTheme).toBe("dark");
		for (const segment of [null, "(app)", "[slug]", "t"])
			expect(themeForSegment(segment)).toBe(THEME.app);
	});

	it("lets the public site follow the device", () => {
		expect(THEME.site.defaultTheme).toBe("system");
		for (const segment of THEME.siteSegments)
			expect(themeForSegment(segment)).toBe(THEME.site);
	});

	it("stores the site choice apart from the app choice", () => {
		expect(THEME.site.storageKey).not.toBe(THEME.app.storageKey);
	});
});
