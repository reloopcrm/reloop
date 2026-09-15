"use client";

import type { DealStage } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { dealStagePresentation } from "@/lib/deal-stage";
import { useT } from "@/lib/i18n/client";

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	const t = useT();
	const { label, tone } = dealStagePresentation(stage);
	return <StatusIndicator tone={tone} label={t(label)} className={className} />;
}
