import { describe, expect, it } from "bun:test";
import { offerLine } from "./quotes-line";

const row = { subject: null, topics: [], summary: "" };

describe("the offer column is one short line", () => {
	it("shows the subject without reply and forward prefixes", () => {
		expect(
			offerLine({
				...row,
				subject: "Re: AW: AW: Überschüssige Europaletten fair abgeben",
			}),
		).toBe("Überschüssige Europaletten fair abgeben");
		expect(offerLine({ ...row, subject: "WG: Paletten" })).toBe("Paletten");
		expect(offerLine({ ...row, subject: "Fwd:Paletten" })).toBe("Paletten");
	});

	it("keeps a subject that only starts like a prefix", () => {
		expect(offerLine({ ...row, subject: "Reifen und Paletten" })).toBe(
			"Reifen und Paletten",
		);
	});

	it("falls back to the first topic when there is no subject", () => {
		expect(
			offerLine({
				...row,
				subject: "AW: ",
				topics: ["  ", "Preis", "Abholung"],
			}),
		).toBe("Preis");
	});

	it("falls back to the summary, then to nothing", () => {
		expect(offerLine({ ...row, summary: "Ein Satz." })).toBe("Ein Satz.");
		expect(offerLine(row)).toBeNull();
	});
});
