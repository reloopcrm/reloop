import { describe, expect, it } from "bun:test";
import { quickSearchEmpty } from "./quick-search";

describe("the quick search empty state", () => {
	it("asks for more characters on a short term", () => {
		expect(quickSearchEmpty("a", false)).toBe("short");
	});

	it("shows searching, not nothing, while the query loads", () => {
		expect(quickSearchEmpty("anna", true)).toBe("searching");
	});

	it("says nothing matches only after the query finished", () => {
		expect(quickSearchEmpty("anna", false)).toBe("none");
	});
});
