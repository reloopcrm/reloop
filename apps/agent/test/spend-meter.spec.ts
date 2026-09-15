import { describe, expect, it } from "bun:test";
import type { SpendEntry } from "@crm/db/model-spend";
import { simulateReadableStream } from "ai";
import { spendOf, spendOfPart, withSpendMeter } from "../agent/lib/spend-meter";

const usage = {
	inputTokens: { total: 800, noCache: 700, cacheRead: 100, cacheWrite: 0 },
	outputTokens: { total: 200 },
};

const parts = [
	{ type: "text-start", id: "1" },
	{ type: "text-delta", id: "1", delta: "hallo" },
	{ type: "text-end", id: "1" },
	{ type: "finish", finishReason: "stop", usage },
];

function fakeModel(collected: unknown[]) {
	return {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doGenerate: async () => ({ content: [], finishReason: "stop", usage }),
		doStream: async () => ({
			stream: simulateReadableStream({
				initialDelayInMs: 0,
				chunkDelayInMs: 0,
				chunks: parts,
			}),
		}),
		collected,
	} as never;
}

describe("reading what one call used", () => {
	it("takes the usage off a finished answer", () => {
		const entry = spendOf("gpt-5.6-terra", "thread-insight", { usage });

		expect(entry?.tokens).toEqual({
			input: 700,
			cacheRead: 100,
			cacheWrite: 0,
			output: 200,
		});
		expect(entry?.kind).toBe("thread-insight");
	});

	it("ignores every stream part that is not the last one", () => {
		expect(spendOfPart("gpt-5.6-terra", "brand", parts[1])).toBeNull();
		expect(
			spendOfPart("gpt-5.6-terra", "brand", { type: "error", usage }),
		).toBeNull();
		expect(spendOfPart("gpt-5.6-terra", "brand", parts[3])?.tokens.output).toBe(
			200,
		);
	});

	it("never throws on an answer it cannot read", () => {
		expect(spendOf("gpt-5.6-terra", "brand", null)).toBeNull();
		expect(spendOf("gpt-5.6-terra", "brand", { usage: "nonsense" })).toBeNull();
		expect(spendOfPart("gpt-5.6-terra", "brand", 7)).toBeNull();
	});
});

describe("the meter around a model", () => {
	it("counts a plain call", async () => {
		const seen: Array<SpendEntry | null> = [];
		const model = withSpendMeter(
			fakeModel([]),
			"gpt-5.6-terra",
			"thread-insight",
			(entry) => seen.push(entry),
		);

		await model.doGenerate({ prompt: [] } as never);

		expect(seen).toHaveLength(1);
		expect(seen[0]?.tokens.output).toBe(200);
		expect(seen[0]?.costUsd).toBeGreaterThan(0);
	});

	it("counts a streamed call and hands every part on unchanged", async () => {
		const seen: Array<SpendEntry | null> = [];
		const model = withSpendMeter(
			fakeModel([]),
			"gpt-5.6-terra",
			"thread-digest",
			(entry) => seen.push(entry),
		);

		const result = await model.doStream({ prompt: [] } as never);
		const passed: unknown[] = [];
		for await (const part of result.stream) passed.push(part);

		expect(passed).toEqual(parts);
		expect(seen.filter(Boolean)).toHaveLength(1);
		expect(seen.filter(Boolean)[0]?.kind).toBe("thread-digest");
	});
});
