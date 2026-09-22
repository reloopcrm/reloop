import { describe, expect, it } from "bun:test";
import { LOCALES } from "@crm/db/locale";
import { demoCopy, demoDictionary } from "../src/demo/demo-copy";
import { demoTexts } from "../src/demo/demo-data";

const DASH = /[‒–—―]/;

describe("the sample data copy", () => {
	it("holds a German line for every English text the seed writes", () => {
		const german = demoDictionary("de");
		if (!german) throw new Error("German copy is missing");

		const missing = demoTexts().filter((text) => !(text in german));

		expect(missing).toEqual([]);
	});

	it("keeps every placeholder and writes no dash", () => {
		const german = demoDictionary("de");
		if (!german) throw new Error("German copy is missing");

		for (const [english, translated] of Object.entries(german)) {
			const wanted = [...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
			for (const name of wanted) expect(translated).toContain(`{${name}}`);
			expect(translated).not.toMatch(DASH);
			expect(translated.trim()).not.toBe("");
		}
	});

	it("falls back to English for every other language", () => {
		for (const locale of LOCALES) {
			const copy = demoCopy(locale);
			const line = copy.t("{qty} pallets", { qty: 12 });
			expect(line).toBe(locale === "de" ? "12 Paletten" : "12 pallets");
		}
		expect(demoCopy("en").inSentence("Stretch film")).toBe("stretch film");
		expect(demoCopy("de").inSentence("Stretchfolie")).toBe("Stretchfolie");
		expect(demoCopy("de").number(1200)).toBe("1.200");
	});
});
