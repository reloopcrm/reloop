import { describe, expect, it } from "bun:test";
import { DISPATCH } from "../agent/lib/dispatch-config";
import {
	currentLane,
	inLane,
	KeyBucket,
	perMinuteFrom,
	slowShareOf,
} from "../agent/lib/key-bucket";

const MINUTE_MS = 60_000;

function clock(start = 0) {
	let at = start;
	return {
		now: () => at,
		advance: (ms: number) => {
			at += ms;
		},
	};
}

describe("the shared key bucket", () => {
	it("reads the per-minute budget from the environment and falls back on nonsense", () => {
		expect(perMinuteFrom({})).toBe(DISPATCH.bucket.perMinute);
		expect(perMinuteFrom({ AGENT_SHARED_KEY_PER_MINUTE: "120" })).toBe(120);
		expect(perMinuteFrom({ AGENT_SHARED_KEY_PER_MINUTE: "zero" })).toBe(
			DISPATCH.bucket.perMinute,
		);
		expect(perMinuteFrom({ AGENT_SHARED_KEY_PER_MINUTE: "0" })).toBe(
			DISPATCH.bucket.perMinute,
		);
	});

	it("shares the slow lane by plan, and a plan it does not know gets the default", () => {
		expect(slowShareOf("trial")).toBe(DISPATCH.bucket.share.byPlan.trial);
		expect(slowShareOf("handel")).toBe(DISPATCH.bucket.share.byPlan.standard);
		expect(slowShareOf(null)).toBe(DISPATCH.bucket.share.other);
	});

	it("keeps 30 % of the budget for the fast lane", () => {
		const time = clock();
		const bucket = new KeyBucket(100, time.now);

		expect(bucket.slowAllowance(null, null)).toBe(70);
		for (let call = 0; call < 70; call += 1) {
			expect(bucket.take("slow", null, null)).toBe(0);
		}
		expect(bucket.slowAllowance(null, null)).toBe(0);
		expect(bucket.take("fast", null, null)).toBe(0);
	});

	it("defers a call over the limit instead of failing it, and the wait ends with the refill", () => {
		const time = clock();
		const bucket = new KeyBucket(60, time.now);

		for (let call = 0; call < 60; call += 1) bucket.take("fast", null, null);
		const wait = bucket.take("fast", null, null);

		expect(wait).toBeGreaterThan(0);
		expect(wait).toBeLessThanOrEqual(DISPATCH.bucket.waitMaxMs);

		time.advance(MINUTE_MS);
		expect(bucket.take("fast", null, null)).toBe(0);
	});

	it("gives two tenants their own slice, so one draining its share starves nobody", () => {
		const time = clock();
		const bucket = new KeyBucket(1_000, time.now);
		const slowBudget = 1_000 * (1 - DISPATCH.bucket.fastReserve);
		const shareA = Math.floor(slowBudget * DISPATCH.bucket.share.byPlan.trial);
		const shareB = Math.floor(slowBudget * DISPATCH.bucket.share.byPlan.team);

		expect(bucket.slowAllowance("a", "trial")).toBe(shareA);
		expect(bucket.slowAllowance("b", "team")).toBe(shareB);

		for (let call = 0; call < shareA; call += 1)
			bucket.take("slow", "a", "trial");

		expect(bucket.slowAllowance("a", "trial")).toBe(0);
		expect(bucket.slowAllowance("b", "team")).toBe(shareB);
		expect(bucket.take("slow", "a", "trial")).toBeGreaterThan(0);
		expect(bucket.take("slow", "b", "team")).toBe(0);
	});

	it("carries the lane through async work and defaults to fast", async () => {
		expect(currentLane()).toBe("fast");
		const seen = await inLane("slow", async () => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			return currentLane();
		});
		expect(seen).toBe("slow");
		expect(currentLane()).toBe("fast");
	});
});
