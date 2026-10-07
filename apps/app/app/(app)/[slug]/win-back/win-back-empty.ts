import type { Translate } from "@/lib/i18n/locale";
import type { RouterOutputs } from "@/lib/trpc/types";

type Reading = Pick<RouterOutputs["reactivation"]["progress"], "pending">;

export function stillReading(progress: Reading | undefined): boolean {
	return (progress?.pending ?? 0) > 0;
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
