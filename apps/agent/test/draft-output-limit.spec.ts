import { describe, expect, it } from "bun:test";
import { simulateReadableStream } from "ai";
import { z } from "zod";
import { DRAFT } from "../agent/lib/draft-config";
import { askJson } from "../agent/lib/insight";

type Call = { providerOptions: unknown; maxOutputTokens: unknown };

function finishing(reason: "stop" | "length", text: string) {
	const calls: Call[] = [];

	const model = {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doStream: async (options: Call) => {
			calls.push({
				providerOptions: options.providerOptions,
				maxOutputTokens: options.maxOutputTokens,
			});

			return {
				stream: simulateReadableStream({
					initialDelayInMs: 0,
					chunkDelayInMs: 0,
					chunks: [
						{ type: "text-start", id: "1" },
						{ type: "text-delta", id: "1", delta: text },
						{ type: "text-end", id: "1" },
						{
							type: "finish",
							finishReason: { unified: reason, raw: reason },
							usage: {
								inputTokens: { total: 0 },
								outputTokens: { total: 0 },
							},
						},
					],
				}),
			};
		},
	};

	return { model: model as never, calls };
}

const schema = z.object({ ok: z.boolean() });
const limits = {
	maxOutputTokens: DRAFT.maxOutputTokens,
	providerOptions: DRAFT.providerOptions,
};

describe("the draft call and its output limit", () => {
	it("sends the draft limit and the low reasoning effort", async () => {
		const { model, calls } = finishing("stop", '{"ok":true}');

		await askJson(model, schema, "Regeln", "Verlauf", schema, limits);

		expect(calls[0]).toEqual({
			maxOutputTokens: DRAFT.maxOutputTokens,
			providerOptions: { openai: { reasoningEffort: "low" } },
		});
	});

	it("fails once with a clear error when the answer is cut off", async () => {
		const { model, calls } = finishing("length", '{"ok":');

		await expect(
			askJson(model, schema, "Regeln", "Verlauf", schema, limits),
		).rejects.toThrow(
			`The answer ran past its limit of ${DRAFT.maxOutputTokens} output tokens`,
		);
		expect(calls).toHaveLength(1);
	});

	it("keeps retrying a caller that sets no limit", async () => {
		const { model, calls } = finishing("length", "kein JSON");

		await expect(askJson(model, schema, "Regeln", "Verlauf")).rejects.toThrow(
			"The model did not return a valid answer",
		);
		expect(calls.length).toBeGreaterThan(1);
	});
});
