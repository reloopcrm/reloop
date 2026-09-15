import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const ORDER = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

type DealStagePresentation = Record<
	DealStage,
	{ label: string; tone: StatusTone; color: string }
>;

const PRESENTATION: DealStagePresentation = {
	DEMO_BOOKED: {
		label: "Demo booked",
		tone: "neutral",
		color: "var(--chart-2)",
	},
	QUALIFIED_TO_BUY: {
		label: "Qualified to buy",
		tone: "info",
		color: "var(--chart-3)",
	},
	DECISION_MAKER_BOUGHT_IN: {
		label: "Decision maker in",
		tone: "info",
		color: "var(--chart-1)",
	},
	CONTRACT_SENT: {
		label: "Contract sent",
		tone: "warning",
		color: "var(--chart-4)",
	},
	CLOSED_WON: {
		label: "Closed won",
		tone: "success",
		color: "var(--chart-5)",
	},
	CLOSED_LOST: {
		label: "Closed lost",
		tone: "error",
		color: "var(--chart-5)",
	},
	UNQUALIFIED_TO_BUY: {
		label: "Unqualified",
		tone: "neutral",
		color: "var(--chart-5)",
	},
};

export const OPEN_STAGES = ORDER.slice(0, 4) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return PRESENTATION[stage].color;
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}
