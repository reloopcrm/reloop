import { describe, expect, it } from "bun:test";
import { DEAL_STAGE_LABEL, dealStageLabelFrom } from "@crm/db/deal-stage";
import { DealStage } from "@crm/db/enums";
import { parseDealStageNames } from "../src/deal-stage-names";

const german = new Map([
	["Demo booked", "Termin vereinbart"],
	["Contract sent", "Vertrag verschickt"],
]);

const translate = (english: string) => german.get(english) ?? english;

describe("parseDealStageNames", () => {
	it("keeps a name the operator typed", () => {
		expect(parseDealStageNames({ DEMO_BOOKED: "Anfrage" })).toEqual({
			DEMO_BOOKED: "Anfrage",
		});
	});

	it("drops a key that is not a stage, and does not throw", () => {
		expect(
			parseDealStageNames({ DEMO_BOOKED: "Anfrage", OLD_STAGE: "Altlast" }),
		).toEqual({ DEMO_BOOKED: "Anfrage" });
	});

	it("falls back to nothing stored when the value is not a map", () => {
		expect(parseDealStageNames("Anfrage")).toEqual({});
		expect(parseDealStageNames([1, 2, 3])).toEqual({});
		expect(parseDealStageNames(null)).toEqual({});
		expect(parseDealStageNames(undefined)).toEqual({});
	});

	it("falls back to nothing stored when a name is not text", () => {
		expect(parseDealStageNames({ DEMO_BOOKED: 7 })).toEqual({});
	});
});

describe("dealStageLabelFrom", () => {
	it("writes the name the operator typed, untranslated", () => {
		const names = parseDealStageNames({ DEMO_BOOKED: "Anfrage" });

		expect(dealStageLabelFrom(names, DealStage.DEMO_BOOKED, translate)).toBe(
			"Anfrage",
		);
	});

	it("writes the built-in name in the reader's language when nothing is stored", () => {
		expect(dealStageLabelFrom({}, DealStage.DEMO_BOOKED, translate)).toBe(
			"Termin vereinbart",
		);
		expect(
			dealStageLabelFrom({}, DealStage.DEMO_BOOKED, (english) => english),
		).toBe(DEAL_STAGE_LABEL.DEMO_BOOKED);
	});

	it("keeps German on a stage the operator did not rename", () => {
		const names = parseDealStageNames({ DEMO_BOOKED: "Anfrage" });

		expect(dealStageLabelFrom(names, DealStage.CONTRACT_SENT, translate)).toBe(
			"Vertrag verschickt",
		);
	});
});
