import { db } from "@crm/db";
import type { WorkspaceScope } from "@crm/db/cloud/contract";
import { cloud } from "@crm/db/cloud/scope";
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
import { asTenant, tenantState } from "./tenant";

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

const pending = tenantState(() => ({
	written: Promise.resolve() as Promise<void>,
}));

export function storeSpend(entry: SpendEntry | null): void {
	if (!entry) return;

	const queue = pending();
	queue.written = queue.written
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
	await pending().written;
}

function callerTenant(): WorkspaceScope | null {
	try {
		return cloud.hosted() ? cloud.current() : null;
	} catch {
		return null;
	}
}

export type SpendSink = (entry: SpendEntry | null) => void;

export function withSpendMeter(
	model: ModelObject,
	modelId: string,
	kind: string,
	sink: SpendSink = storeSpend,
): ModelObject {
	const record = (tenant: WorkspaceScope | null, entry: SpendEntry | null) => {
		try {
			asTenant(tenant, () => sink(entry));
		} catch (error) {
			console.error(
				`[agent] could not record what the model call cost: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	};

	const middleware: LanguageModelMiddleware = {
		wrapGenerate: async ({ doGenerate }) => {
			const tenant = callerTenant();
			const result = await doGenerate();
			record(tenant, spendOf(modelId, kind, result));
			return result;
		},
		wrapStream: async ({ doStream }) => {
			const tenant = callerTenant();
			const { stream, ...rest } = await doStream();

			const meter = new TransformStream({
				transform(part, controller) {
					record(tenant, spendOfPart(modelId, kind, part));
					controller.enqueue(part);
				},
			});

			return { stream: stream.pipeThrough(meter), ...rest };
		},
	};

	return wrapLanguageModel({ model, middleware }) as ModelObject;
}
