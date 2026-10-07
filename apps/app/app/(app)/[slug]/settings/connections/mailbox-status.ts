import type { Translate } from "@/lib/i18n/locale";
import type { ImportProgress } from "@/lib/import-progress";

export type MailboxSourceHealth = {
	status: string | null;
	lastError: string | null;
};

export function mailboxNeedsAttention(
	sources: readonly MailboxSourceHealth[],
): boolean {
	return sources.some(
		(source) =>
			source.status === "NEEDS_RECONNECT" ||
			source.status === "FAILED" ||
			Boolean(source.lastError),
	);
}

export function mailboxStatus(
	progress: ImportProgress | null,
	sources: readonly MailboxSourceHealth[],
	t: Translate,
): string {
	if (mailboxNeedsAttention(sources)) return t("Needs attention");
	return progress && !progress.done ? t("Reading mail") : t("Connected");
}
