import { describe, expect, it } from "bun:test";
import german from "@/lib/i18n/de/win-back.json";
import { interpolate, type Translate } from "@/lib/i18n/locale";
import { nextLabel, placeLabel } from "./person-view";

const english: Translate = (text, vars) => interpolate(text, vars);

const dictionary: Record<string, string> = german;

const inGerman: Translate = (text, vars) =>
	interpolate(dictionary[text] ?? text, vars);

describe("the continue button", () => {
	it("names the next person in the list", () => {
		expect(nextLabel({ id: "c1", name: "Moritz Ahlers" }, english)).toBe(
			"Continue with Moritz Ahlers",
		);
	});

	it("returns to the list at the end of the list", () => {
		expect(nextLabel(null, english)).toBe("Back to the list");
		expect(nextLabel(null, inGerman)).toBe("Zurück zur Liste");
	});
});

describe("the place in the list", () => {
	it("counts the person in the list's order", () => {
		const list = { next: null, position: 12, total: 87 };

		expect(placeLabel(list, english, "en")).toBe("Person 12 of 87");
		expect(placeLabel(list, inGerman, "de")).toBe("Person 12 von 87");
	});

	it("formats large numbers like the list does", () => {
		expect(
			placeLabel({ next: null, position: 1000, total: 1000 }, english, "en"),
		).toBe("Person 1,000 of 1,000");
	});

	it("shows nothing for a person outside the list", () => {
		expect(
			placeLabel({ next: null, position: null, total: 87 }, english, "en"),
		).toBe(null);
		expect(placeLabel(null, english, "en")).toBe(null);
	});
});
