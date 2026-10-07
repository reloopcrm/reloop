import type { MailboxProviderId } from "@crm/auth/scopes";
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

export type MailboxConnectionHealth = {
	hasRefreshToken: boolean;
	sources: readonly MailboxSourceHealth[];
};

export function mailboxNeedsReconnect(
	provider: MailboxProviderId,
	health: MailboxConnectionHealth,
): boolean {
	if (health.sources.some((source) => source.status === "NEEDS_RECONNECT")) {
		return true;
	}
	return provider === "microsoft" && !health.hasRefreshToken;
}

export function mailboxReconnected(health: MailboxConnectionHealth): boolean {
	return health.hasRefreshToken && !mailboxNeedsAttention(health.sources);
}

export function failureSignature(
	sources: readonly (MailboxSourceHealth & { source: string })[],
): string {
	const failures: string[] = [];
	for (const source of sources) {
		if (source.status === "NEEDS_RECONNECT" || source.lastError) {
			failures.push(`${source.source}:${source.lastError ?? "reconnect"}`);
		}
	}
	return failures.sort().join("|");
}
