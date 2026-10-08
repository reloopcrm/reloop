import { describe, expect, it } from "bun:test";
import { usageLines } from "@crm/db/plan-usage";
import { TEST_PLANS } from "@crm/db/test-plans";
import { aiUsageOutput } from "../src/settings/settings.contracts";

const USAGE = {
	insights: 0,
	drafts: 0,
	sessions: 85,
	research: 0,
	chat: 0,
	builder: 100,
};

describe("the ai usage contract", () => {
	const parsed = aiUsageOutput.parse({
		fixed: false,
		label: "Small",
		month: "2026-10-01T00:00:00.000Z",
		resetsAt: "2026-11-01T00:00:00.000Z",
		trialEnds: false,
		capacity: [{ counter: "contacts", used: 10, limit: 100, level: "normal" }],
		lines: usageLines(USAGE, TEST_PLANS.small),
	});

	it("keeps reached on every line for older readers", () => {
		for (const line of parsed.lines) {
			expect(line.reached).toBe(line.level === "reached");
		}
	});

	it("carries the warning and the reached level", () => {
		const of = (counter: string) =>
			parsed.lines.find((line) => line.counter === counter);
		expect(of("sessions")).toMatchObject({ level: "warning", reached: false });
		expect(of("builder")).toMatchObject({ level: "reached", reached: true });
	});
});
