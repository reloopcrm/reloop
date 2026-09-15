import { describe, expect, it } from "bun:test";
import { costOf, MODEL_PRICES, priceOf } from "../src/model-prices";
import { dayOf, spendFromUsage, tokensFromUsage } from "../src/model-spend";
import { AGENT_MODEL_OPTIONS } from "../src/settings";

const usage = (
	input: number | null,
	cacheRead: number | null,
	output: number,
	total?: number,
) => ({
	inputTokens: {
		total: total ?? (input ?? 0) + (cacheRead ?? 0),
		noCache: input,
		cacheRead,
		cacheWrite: null,
	},
	outputTokens: { total: output },
});

describe("the price list", () => {
	it("names a price for every model the settings offer", () => {
		const offered = Object.values(AGENT_MODEL_OPTIONS)
			.flat()
			.map((option) => option.id);

		for (const id of offered) {
			expect(priceOf(id)).not.toBeNull();
		}
	});

	it("reads a gateway name with a vendor in front of it", () => {
		expect(priceOf("openai/gpt-5.6-terra")).toEqual(
			MODEL_PRICES["gpt-5.6-terra"],
		);
	});

	it("knows nothing about a model that is not on the list", () => {
		expect(priceOf("zai/glm-5.2-fast")).toBeNull();
		expect(costOf("zai/glm-5.2-fast", tokens())).toBeNull();
	});

	it("charges a cache write more than a plain input token on Astra", () => {
		expect(MODEL_PRICES["gpt-6-astra"].cacheWrite).toBeGreaterThan(
			MODEL_PRICES["gpt-6-astra"].input,
		);
	});
});

function tokens(input = 1_000, cacheRead = 0, cacheWrite = 0, output = 1_000) {
	return { input, cacheRead, cacheWrite, output };
}

describe("what a call costs", () => {
	it("counts input and output apart", () => {
		expect(costOf("gpt-5.6-terra", tokens(1_000_000, 0, 0, 0))).toBe(2);
		expect(costOf("gpt-5.6-terra", tokens(0, 0, 0, 1_000_000))).toBe(12);
	});

	it("charges a cached token less", () => {
		const plain = costOf("gpt-5.6-terra", tokens(1_000_000, 0, 0, 0)) ?? 0;
		const cached = costOf("gpt-5.6-terra", tokens(0, 1_000_000, 0, 0)) ?? 0;

		expect(cached).toBeLessThan(plain);
	});

	it("charges a cache write at the input rate when the vendor names no extra price", () => {
		expect(costOf("gpt-5.5", tokens(0, 0, 1_000_000, 0))).toBe(5);
	});

	it("charges Astra more for a cache write than for an input token", () => {
		const write = costOf("gpt-6-astra", tokens(0, 0, 1_000_000, 0)) ?? 0;
		const input = costOf("gpt-6-astra", tokens(1_000_000, 0, 0, 0)) ?? 0;

		expect(write).toBeGreaterThan(input);
	});

	it("stays a real number for one small call", () => {
		const cost = costOf("gpt-5.6-terra", tokens(787, 0, 0, 153)) ?? 0;

		expect(cost).toBeGreaterThan(0);
		expect(cost).toBeLessThan(0.01);
	});
});

describe("reading the usage the model reports", () => {
	it("takes the counts the vendor gives", () => {
		expect(tokensFromUsage(usage(700, 100, 200))).toEqual({
			input: 700,
			cacheRead: 100,
			cacheWrite: 0,
			output: 200,
		});
	});

	it("works out the plain input when only a total is given", () => {
		expect(tokensFromUsage(usage(null, 100, 200, 800))).toEqual({
			input: 700,
			cacheRead: 100,
			cacheWrite: 0,
			output: 200,
		});
	});

	it("never reports a negative count", () => {
		expect(tokensFromUsage(usage(null, 900, 0, 100))?.input).toBe(0);
	});

	it("reports nothing when the call used nothing", () => {
		expect(tokensFromUsage(usage(0, 0, 0, 0))).toBeNull();
		expect(tokensFromUsage(null)).toBeNull();
	});

	it("builds an entry with the model, the kind and the cost", () => {
		const entry = spendFromUsage("gpt-5.6-terra", "thread-insight", {
			inputTokens: { total: 787, noCache: 787, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 153 },
		});

		expect(entry?.model).toBe("gpt-5.6-terra");
		expect(entry?.kind).toBe("thread-insight");
		expect(entry?.costUsd).toBeGreaterThan(0);
	});

	it("keeps the entry even when the model has no price", () => {
		const entry = spendFromUsage("zai/glm-5.2-fast", "research", {
			inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 10 },
		});

		expect(entry?.tokens.input).toBe(100);
		expect(entry?.costUsd).toBeNull();
	});
});

describe("the day a call belongs to", () => {
	it("cuts the time off and stays in UTC", () => {
		expect(dayOf(new Date("2026-09-12T23:59:59.999Z")).toISOString()).toBe(
			"2026-09-12T00:00:00.000Z",
		);
	});
});
