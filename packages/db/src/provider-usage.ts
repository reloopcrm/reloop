import type { Db } from "./client";

export type ProviderUsageSnapshot = {
	provider: string;
	planType: string | null;
	primaryUsedPercent: number | null;
	primaryResetAt: Date | null;
	primaryWindowMinutes: number | null;
	secondaryUsedPercent: number | null;
	secondaryResetAt: Date | null;
	secondaryWindowMinutes: number | null;
	fasterModel: string | null;
};

function int(value: string | undefined): number | null {
	if (value === undefined) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function epoch(value: string | undefined): Date | null {
	const seconds = int(value);
	return seconds === null ? null : new Date(seconds * 1_000);
}

export function usageFromCodexHeaders(
	headers: Record<string, string>,
): ProviderUsageSnapshot | null {
	const get = (name: string) => headers[name] ?? headers[name.toLowerCase()];
	const primary = int(get("x-codex-primary-used-percent"));
	if (primary === null) return null;

	return {
		provider: "chatgpt",
		planType: get("x-codex-plan-type") ?? null,
		primaryUsedPercent: primary,
		primaryResetAt: epoch(get("x-codex-primary-reset-at")),
		primaryWindowMinutes: int(get("x-codex-primary-window-minutes")),
		secondaryUsedPercent: int(get("x-codex-secondary-used-percent")),
		secondaryResetAt: epoch(get("x-codex-secondary-reset-at")),
		secondaryWindowMinutes: int(get("x-codex-secondary-window-minutes")),
		fasterModel: get("x-codex-safety-buffering-faster-model") ?? null,
	};
}

export async function writeProviderUsage(
	db: Db,
	snapshot: ProviderUsageSnapshot,
): Promise<void> {
	const { provider, ...fields } = snapshot;

	await db.providerUsage.upsert({
		where: { provider },
		create: { provider, ...fields },
		update: fields,
	});
}

export async function readProviderUsage(
	db: Db,
	provider: string,
): Promise<(ProviderUsageSnapshot & { updatedAt: Date }) | null> {
	return db.providerUsage.findUnique({ where: { provider } });
}
