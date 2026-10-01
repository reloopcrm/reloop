import { DealStage } from "@crm/db/enums";
import type { MarkTone } from "@crm/ui/components/mark";
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
	{ tone: StatusTone; mark: MarkTone }
>;

const PRESENTATION: DealStagePresentation = {
	DEMO_BOOKED: {
		tone: "neutral",
		mark: "faint",
	},
	QUALIFIED_TO_BUY: {
		tone: "success",
		mark: "blue",
	},
	DECISION_MAKER_BOUGHT_IN: {
		tone: "info",
		mark: "orange",
	},
	CONTRACT_SENT: {
		tone: "warning",
		mark: "ink",
	},
	CLOSED_WON: {
		tone: "success",
		mark: "blue",
	},
	CLOSED_LOST: {
		tone: "error",
		mark: "faint",
	},
	UNQUALIFIED_TO_BUY: {
		tone: "neutral",
		mark: "hollow",
	},
};

export const OPEN_STAGES = ORDER.slice(0, 4) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
];

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageMark(stage: DealStage): MarkTone {
	return PRESENTATION[stage].mark;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}
