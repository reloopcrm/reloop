"use client";

import {
	DEAL_STAGES,
	type DealStageNames,
	dealStageLabelFrom,
} from "@crm/db/deal-stage";
import type { DealStage } from "@crm/db/enums";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

export function useDealStageNames(): DealStageNames {
	const trpc = useTRPC();
	const stages = useQuery(trpc.settings.dealStages.queryOptions()).data?.stages;

	return useMemo(() => {
		const names: DealStageNames = {};

		for (const entry of stages ?? []) {
			if (entry.name) names[entry.stage] = entry.name;
		}

		return names;
	}, [stages]);
}

export function useDealStageLabel(): (stage: DealStage) => string {
	const t = useT();
	const names = useDealStageNames();

	return useMemo(
		() => (stage: DealStage) => dealStageLabelFrom(names, stage, t),
		[names, t],
	);
}

export function useDealStageOptions(): {
	value: DealStage;
	label: string;
}[] {
	const label = useDealStageLabel();

	return useMemo(
		() => DEAL_STAGES.map((value) => ({ value, label: label(value) })),
		[label],
	);
}
