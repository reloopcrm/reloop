"use client";

import type { DealStage } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { dealStagePresentation } from "@/lib/deal-stage";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	const label = useDealStageLabel();
	const { tone } = dealStagePresentation(stage);
	return (
		<StatusIndicator tone={tone} label={label(stage)} className={className} />
	);
}
