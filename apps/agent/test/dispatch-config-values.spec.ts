import { describe, expect, it } from "bun:test";
import { DISPATCH } from "../agent/lib/dispatch-config";

describe("dispatch config values", () => {
	it("keeps the housekeeping limits", () => {
		expect(DISPATCH.housekeeping.cleanBatch).toBe(20);
		expect(DISPATCH.housekeeping.readBatch).toBe(40);
		expect(DISPATCH.housekeeping.dayMs).toBe(86_400_000);
	});

	it("keeps the research hour", () => {
		expect(DISPATCH.research.hourMs).toBe(3_600_000);
	});

	it("keeps the blank fact limits", () => {
		expect(DISPATCH.blankFacts.scan).toBe(2000);
		expect(DISPATCH.blankFacts.maxFills).toBe(500);
	});

	it("keeps the bucket minute", () => {
		expect(DISPATCH.bucket.minuteMs).toBe(60_000);
	});
});
