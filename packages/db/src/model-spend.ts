import type { Db } from "./client";
import { costOf, priceOf, type TokenCount } from "./model-prices";

export type ModelUsage = {
	inputTokens?: {
		total?: number | null;
		noCache?: number | null;
		cacheRead?: number | null;
		cacheWrite?: number | null;
	} | null;
	outputTokens?: { total?: number | null } | null;
};

export type SpendEntry = {
	model: string;
	kind: string;
	tokens: TokenCount;
	costUsd: number | null;
};

const whole = (value: number | null | undefined): number =>
	value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

export function tokensFromUsage(usage: ModelUsage | null): TokenCount | null {
	if (!usage) return null;

	const cacheRead = whole(usage.inputTokens?.cacheRead);
	const cacheWrite = whole(usage.inputTokens?.cacheWrite);
	const total = whole(usage.inputTokens?.total);
	const noCache = usage.inputTokens?.noCache;
	const input =
		noCache != null
			? whole(noCache)
			: Math.max(total - cacheRead - cacheWrite, 0);
	const output = whole(usage.outputTokens?.total);

	if (input + cacheRead + cacheWrite + output === 0) return null;

	return { input, cacheRead, cacheWrite, output };
}

export function spendFromUsage(
	model: string,
	kind: string,
	usage: ModelUsage | null,
): SpendEntry | null {
	const tokens = tokensFromUsage(usage);
	if (!tokens) return null;

	return { model, kind, tokens, costUsd: costOf(model, tokens) };
}

export function dayOf(now: Date): Date {
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

export async function writeModelSpend(
	db: Db,
	entry: SpendEntry,
	now: Date = new Date(),
): Promise<void> {
	const day = dayOf(now);
	const cost = entry.costUsd ?? 0;
	const priced = priceOf(entry.model) !== null;

	await db.modelSpend.upsert({
		where: {
			day_model_kind: { day, model: entry.model, kind: entry.kind },
		},
		create: {
			day,
			model: entry.model,
			kind: entry.kind,
			calls: 1,
			inputTokens: entry.tokens.input,
			cacheReadTokens: entry.tokens.cacheRead,
			cacheWriteTokens: entry.tokens.cacheWrite,
			outputTokens: entry.tokens.output,
			costUsd: cost,
			priced,
		},
		update: {
			calls: { increment: 1 },
			inputTokens: { increment: entry.tokens.input },
			cacheReadTokens: { increment: entry.tokens.cacheRead },
			cacheWriteTokens: { increment: entry.tokens.cacheWrite },
			outputTokens: { increment: entry.tokens.output },
			costUsd: { increment: cost },
			priced: priced ? undefined : false,
		},
	});
}

export type SpendLine = {
	model: string;
	kind: string;
	calls: number;
	inputTokens: number;
	cacheReadTokens: number;
	outputTokens: number;
	costUsd: number;
	priced: boolean;
};

export type SpendReport = {
	since: Date;
	lines: SpendLine[];
	costUsd: number;
	calls: number;
};

export async function readModelSpend(
	db: Db,
	since: Date,
): Promise<SpendReport> {
	const rows = await db.modelSpend.groupBy({
		by: ["model", "kind", "priced"],
		where: { day: { gte: dayOf(since) } },
		_sum: {
			calls: true,
			inputTokens: true,
			cacheReadTokens: true,
			outputTokens: true,
			costUsd: true,
		},
	});

	const lines = rows
		.map((row) => ({
			model: row.model,
			kind: row.kind,
			priced: row.priced,
			calls: row._sum.calls ?? 0,
			inputTokens: Number(row._sum.inputTokens ?? 0),
			cacheReadTokens: Number(row._sum.cacheReadTokens ?? 0),
			outputTokens: Number(row._sum.outputTokens ?? 0),
			costUsd: Number(row._sum.costUsd ?? 0),
		}))
		.sort((left, right) => right.costUsd - left.costUsd);

	return {
		since: dayOf(since),
		lines,
		costUsd: lines.reduce((sum, line) => sum + line.costUsd, 0),
		calls: lines.reduce((sum, line) => sum + line.calls, 0),
	};
}
