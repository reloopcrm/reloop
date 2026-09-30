import { afterAll, describe, expect, it } from "bun:test";
import { cloud } from "@crm/db/cloud/scope";
import { simulateReadableStream } from "ai";
import { withSpendMeter } from "../agent/lib/spend-meter";
import { actHosted, actSelfHosted, workspace } from "./hosted-cloud";

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

function fakeModel() {
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
	} as never;
}

async function readAll(stream: ReadableStream<unknown>): Promise<unknown[]> {
	const passed: unknown[] = [];
	const reader = stream.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return passed;
		passed.push(value);
	}
}

afterAll(actSelfHosted);

describe("the stream meter on the hosted cloud", () => {
	it("records the cost for the tenant that started the stream", async () => {
		actHosted();
		const tenants: string[] = [];
		const model = withSpendMeter(
			fakeModel(),
			"gpt-5.6-terra",
			"research",
			(entry) => {
				if (entry) tenants.push(cloud.scopeId() ?? "none");
			},
		);

		const result = await cloud.run(workspace("tenant-spend-a"), () =>
			model.doStream({ prompt: [] } as never),
		);
		const passed = await new Promise<unknown[]>((resolve, reject) => {
			setTimeout(() => readAll(result.stream).then(resolve, reject), 0);
		});

		expect(passed).toEqual(parts);
		expect(tenants).toEqual(["tenant-spend-a"]);
	});

	it("hands every part on when recording fails", async () => {
		actHosted();
		const model = withSpendMeter(
			fakeModel(),
			"gpt-5.6-terra",
			"research",
			() => {
				throw new Error("No tenant in context");
			},
		);

		const result = await model.doStream({ prompt: [] } as never);

		expect(await readAll(result.stream)).toEqual(parts);
	});
});
