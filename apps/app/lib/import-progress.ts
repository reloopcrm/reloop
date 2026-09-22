const DAY_MS = 86_400_000;

export const IMPORT_PROGRESS = {
	doneVisibleMs: 7 * DAY_MS,
	runningMaxPercent: 99,
} as const;

export type BackfillState = {
	state: "running" | "done";
	before: string;
	reached: string | null;
	floor: string | null;
};

export type ImportProgress = {
	done: boolean;
	reached: string | null;
	percent: number | null;
};

export function importProgressOf(
	backfill: BackfillState | null | undefined,
	now: Date = new Date(),
): ImportProgress | null {
	if (!backfill) return null;

	const before = Date.parse(backfill.before);
	if (Number.isNaN(before)) return null;

	if (backfill.state === "done") {
		if (backfill.reached === null) return null;
		if (now.getTime() - before > IMPORT_PROGRESS.doneVisibleMs) return null;
		return { done: true, reached: backfill.reached, percent: 100 };
	}

	const floor = backfill.floor === null ? null : Date.parse(backfill.floor);
	if (floor === null || Number.isNaN(floor) || floor >= before) {
		return { done: false, reached: backfill.reached, percent: null };
	}

	const reached =
		backfill.reached === null ? before : Date.parse(backfill.reached);
	const share = Number.isNaN(reached)
		? 0
		: (before - Math.max(reached, floor)) / (before - floor);
	const percent = Math.min(
		IMPORT_PROGRESS.runningMaxPercent,
		Math.max(0, Math.round(share * 100)),
	);

	return { done: false, reached: backfill.reached, percent };
}
