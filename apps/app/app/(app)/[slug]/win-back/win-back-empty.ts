import type { Translate } from "@/lib/i18n/locale";
import type { RouterOutputs } from "@/lib/trpc/types";

type Reading = Pick<
	RouterOutputs["reactivation"]["progress"],
	"pending" | "canRead" | "paused" | "readingBlock"
>;

export function stillReading(progress: Reading | undefined): boolean {
	return (
		(progress?.pending ?? 0) > 0 &&
		(progress?.canRead === true || progress?.paused === true)
	);
}

export function winBackEmptyText(
	progress: Reading | undefined,
	t: Translate,
): string {
	return stillReading(progress)
		? t(
				"Reloop is still reading your mail. Quiet customers show up here as soon as their conversations are read.",
			)
		: t("Nobody has gone quiet.");
}

export type ReadingHint = { text: string; action: string; path: string };

export function readingHint(
	progress: Reading | undefined,
	t: Translate,
): ReadingHint | null {
	if (!progress || progress.canRead) return null;

	if (progress.readingBlock === "noProvider") {
		return {
			text: t(
				"Reloop cannot read your mail because no AI provider is connected.",
			),
			action: t("Connect an AI provider"),
			path: "/settings/ai",
		};
	}
	if (progress.readingBlock === "functionOff") {
		return {
			text: t(
				"Reloop cannot read your mail because conversation summaries are switched off.",
			),
			action: t("Switch summaries on"),
			path: "/settings/functions",
		};
	}
	return null;
}
