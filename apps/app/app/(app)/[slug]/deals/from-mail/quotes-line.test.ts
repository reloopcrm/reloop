import { describe, expect, it } from "bun:test";
import { shortLine } from "./quotes-line";

describe("the offer column reads as a summary, not as sentences", () => {
	it("joins the topics the agent already read", () => {
		expect(
			shortLine({
				topics: [
					"Ankauf überschüssiger Europaletten",
					"Preisverhandlung",
					"Abholung in Hannover",
				],
				summary:
					"Weber Logistik bot 800 bis 1000 unbenutzte Europaletten zur Abholung in Hannover an.",
			}),
		).toBe(
			"Ankauf überschüssiger Europaletten · Preisverhandlung · Abholung in Hannover",
		);
	});

	it("keeps the line short when the agent read many topics", () => {
		expect(
			shortLine({
				topics: ["eins", "zwei", "drei", "vier", "fünf"],
				summary: "",
			}),
		).toBe("eins · zwei · drei");
	});

	it("falls back to the sentences when a row has no topics", () => {
		expect(shortLine({ topics: [], summary: "Ein ganzer Satz." })).toBe(
			"Ein ganzer Satz.",
		);
	});

	it("drops a blank topic instead of showing an empty piece", () => {
		expect(shortLine({ topics: ["  ", "Preis"], summary: "x" })).toBe("Preis");
	});
});
