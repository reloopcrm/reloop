import { describe, expect, it } from "bun:test";
import { parseThreadEvidence } from "../src/thread-evidence";

describe("an evidence quote points at the message it came from", () => {
	it("keeps the id beside a quote the agent wrote with one", () => {
		expect(
			parseThreadEvidence({
				evidence: ["We need 620 pallets.", "Price is fine."],
				evidenceMessageIds: ["m1", "m2"],
			}),
		).toEqual([
			{ quote: "We need 620 pallets.", messageId: "m1" },
			{ quote: "Price is fine.", messageId: "m2" },
		]);
	});

	it("still reads a row written before the id existed", () => {
		expect(
			parseThreadEvidence({
				evidence: ["We need 620 pallets."],
				evidenceMessageIds: [],
			}),
		).toEqual([{ quote: "We need 620 pallets.", messageId: null }]);
	});

	it("reads an empty id as no id", () => {
		expect(
			parseThreadEvidence({
				evidence: ["We need 620 pallets."],
				evidenceMessageIds: [" "],
			}),
		).toEqual([{ quote: "We need 620 pallets.", messageId: null }]);
	});

	it("refuses a shape it cannot read", () => {
		expect(() => parseThreadEvidence({ evidence: "one quote" })).toThrow();
	});
});
