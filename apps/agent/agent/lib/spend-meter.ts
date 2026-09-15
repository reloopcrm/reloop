import { db } from "@crm/db";
import {
	type SpendEntry,
	spendFromUsage,
	writeModelSpend,
} from "@crm/db/model-spend";
import {
	type LanguageModel,
	type LanguageModelMiddleware,
	wrapLanguageModel,
} from "ai";
import { z } from "zod";

type ModelObject = Exclude<LanguageModel, string>;

type GenerateResult = Awaited<
	ReturnType<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>
>;

type StreamPart =
	Awaited<
		ReturnType<NonNullable<LanguageModelMiddleware["wrapStream"]>>
	>["stream"] extends ReadableStream<infer Part>
		? Part
		: never;

const tokenGroup = z
	.object({
		total: z.number().nullish(),
		noCache: z.number().nullish(),
		cacheRead: z.number().nullish(),
		cacheWrite: z.number().nullish(),
	})
	.nullish();

const usageShape = z
	.object({
		inputTokens: tokenGroup,
		outputTokens: z.object({ total: z.number().nullish() }).nullish(),
	})
	.nullish();

const generateResult = z.object({ usage: usageShape }).catch({ usage: null });

const finishPart = z
	.object({ type: z.string(), usage: usageShape })
	.catch({ type: "", usage: null });

export function spendOf(
	model: string,
	kind: string,
	result: GenerateResult,
): SpendEntry | null {
	return spendFromUsage(
		model,
		kind,
		generateResult.parse(result).usage ?? null,
	);
}

export function spendOfPart(
	model: string,
	kind: string,
	part: StreamPart,
): SpendEntry | null {
	const parsed = finishPart.parse(part);
	if (parsed.type !== "finish") return null;

	return spendFromUsage(model, kind, parsed.usage ?? null);
}

let written: Promise<void> = Promise.resolve();

export function storeSpend(entry: SpendEntry | null): void {
	if (!entry) return;

	written = written
		.catch(() => {})
		.then(() =>
			writeModelSpend(db, entry).catch((error) => {
				console.error(
					`[agent] could not store what the model call cost: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}),
		);
}

export async function spendWritten(): Promise<void> {
	await written;
}

export type SpendSink = (entry: SpendEntry | null) => void;

export function withSpendMeter(
	model: ModelObject,
	modelId: string,
	kind: string,
	sink: SpendSink = storeSpend,
): ModelObject {
	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate }) => {
			const result = await doGenerate();
			sink(spendOf(modelId, kind, result));
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const { stream, ...rest } = await doStream();

			const meter = new TransformStream({
				transform(part, controller) {
					sink(spendOfPart(modelId, kind, part));
					controller.enqueue(part);
				},
			});

			return { stream: stream.pipeThrough(meter), ...rest };
		},
	};

	return wrapLanguageModel({ model, middleware }) as ModelObject;
}
