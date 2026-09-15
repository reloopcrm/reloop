import { describe, expect, it } from "bun:test";
import { simulateReadableStream } from "ai";
import { z } from "zod";
import { askJson } from "../agent/lib/insight";

type Call = { prompt: unknown };

function answering(answers: string[]) {
	const calls: Call[] = [];

	const model = {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doStream: async (options: { prompt: unknown }) => {
			calls.push({ prompt: options.prompt });
			const text = answers[calls.length - 1] ?? answers[answers.length - 1];

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
							finishReason: "stop",
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

const systemsOf = (call: Call) =>
	(call.prompt as Array<{ role: string; content: unknown }>).filter(
		(message) => message.role === "system",
	);

describe("the reading call", () => {
	it("marks the long system text as cacheable", async () => {
		const { model, calls } = answering(['{"ok":true}']);

		await askJson(model, schema, "Die Regeln", "Der Verlauf");

		const systems = systemsOf(calls[0] as Call);
		expect(systems).toHaveLength(1);
		expect(systems[0]).toMatchObject({
			providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
		});
	});

	it("keeps the cached text identical when an answer is rejected", async () => {
		const { model, calls } = answering(["kein JSON", '{"ok":true}']);

		await askJson(model, schema, "Die Regeln", "Der Verlauf");

		expect(calls).toHaveLength(2);

		const first = systemsOf(calls[0] as Call);
		const second = systemsOf(calls[1] as Call);

		expect(second[0]).toEqual(first[0] as never);
		expect(second).toHaveLength(2);
		expect(JSON.stringify(second[1])).toContain("rejected");
	});
});
