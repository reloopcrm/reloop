import { describe, expect, it } from "bun:test";
import {
	readDealStep,
	stallSweepDue,
	withoutDashes,
} from "../agent/lib/deal-stall";
import { DISPATCH } from "../agent/lib/dispatch-config";

describe("stallSweepDue", () => {
	const now = new Date("2026-09-19T12:00:00Z");

	it("runs when nothing was ever queued", () => {
		expect(stallSweepDue(null, now)).toBe(true);
	});

	it("waits a week after the last queue", () => {
		const recent = new Date(now.getTime() - DISPATCH.dealStall.everyMs + 1);
		const old = new Date(now.getTime() - DISPATCH.dealStall.everyMs);
		expect(stallSweepDue(recent, now)).toBe(false);
		expect(stallSweepDue(old, now)).toBe(true);
	});
});

describe("withoutDashes", () => {
	it("replaces a dash used as punctuation", () => {
		expect(withoutDashes("Call Anna — she owes the price")).toBe(
			"Call Anna, she owes the price",
		);
	});

	it("keeps a number range readable", () => {
		expect(withoutDashes("8–9 pallets")).toBe("8-9 pallets");
	});
});

describe("readDealStep", () => {
	it("reads a fenced answer and strips dashes", () => {
		const read = readDealStep(
			'```json\n{"subject":"Ask about the quote — today","body":"Anna asked for a price on 2 May."}\n```',
		);
		expect(read).toEqual({
			ok: true,
			step: {
				subject: "Ask about the quote, today",
				body: "Anna asked for a price on 2 May.",
			},
		});
	});

	it("rejects an answer without a body", () => {
		const read = readDealStep('{"subject":"Call"}');
		expect(read.ok).toBe(false);
	});

	it("rejects text that is not JSON", () => {
		expect(readDealStep("no idea").ok).toBe(false);
	});
});
