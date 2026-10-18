"use client";

import type { EnrichmentStatus } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { enrichmentPresentation } from "@/lib/enrichment-status";
import { useT } from "@/lib/i18n/client";

export function EnrichmentIndicator({
	status,
	queued = false,
	title,
	className,
}: {
	status: EnrichmentStatus;
	queued?: boolean;
	title?: string | null;
	className?: string;
}) {
	const t = useT();
	const { label, tone, busy } = enrichmentPresentation(status, queued);

	return (
		<StatusIndicator
			tone={tone}
			busy={busy}
			label={t(label)}
			title={title ?? undefined}
			className={className}
		/>
	);
}
