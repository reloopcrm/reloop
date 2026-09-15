import { describe, expect, it } from "bun:test";
import { language, say, writesGerman } from "../agent/lib/language";

describe("the language the agent writes in", () => {
	it("writes English unless RELOOP_GERMAN is exactly true", () => {
		for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
			const env = { RELOOP_GERMAN: value };
			expect(writesGerman(env)).toBe(false);
			expect(language(env)).toBe("English");
			expect(say("Hello", "Hallo", env)).toBe("Hello");
		}
	});

	it("writes German when RELOOP_GERMAN is true", () => {
		const env = { RELOOP_GERMAN: "true" };
		expect(writesGerman(env)).toBe(true);
		expect(language(env)).toBe("German");
		expect(say("Hello", "Hallo", env)).toBe("Hallo");
	});
});
