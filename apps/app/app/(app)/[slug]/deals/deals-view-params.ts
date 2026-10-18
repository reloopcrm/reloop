import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

const DEAL_VIEWS = ["pipeline", "list", "closed"] as const;

export type DealView = (typeof DEAL_VIEWS)[number];

export const dealViewParsers = {
	[SEARCH_PARAM.deals.view]:
		parseAsStringLiteral(DEAL_VIEWS).withDefault("pipeline"),
};

export const loadDealView = createLoader(dealViewParsers);
