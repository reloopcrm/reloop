import { describe, expect, it } from "bun:test";
import { THEME, themeForSegment } from "../lib/theme-config";

describe("themeForSegment", () => {
	it("keeps the app dark", () => {
		expect(THEME.app).toBe("dark");
		for (const segment of [null, "(app)", "[slug]", "t"])
			expect(themeForSegment(segment)).toBe("dark");
	});

	it("gives the public site its own default", () => {
		expect(themeForSegment("(landing)")).toBe(THEME.site);
	});
});
