import { DealStage } from "./generated/prisma/enums";

export const OPEN_DEAL_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
] as const;

export const CLOSED_DEAL_STAGES = [
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export const LOSING_DEAL_STAGES = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export const DEAL_STAGE_LABEL = {
	DEMO_BOOKED: "Demo booked",
	QUALIFIED_TO_BUY: "Qualified to buy",
	DECISION_MAKER_BOUGHT_IN: "Decision maker in",
	CONTRACT_SENT: "Contract sent",
	CLOSED_WON: "Closed won",
	CLOSED_LOST: "Closed lost",
	UNQUALIFIED_TO_BUY: "Unqualified",
} satisfies Record<DealStage, string>;

const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);

export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}
