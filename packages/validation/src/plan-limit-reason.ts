import { z } from "zod";

export const LIMIT_REASONS = ["plan", "provider"] as const;

export type LimitReason = (typeof LIMIT_REASONS)[number];

export const limitReason = z.enum(LIMIT_REASONS);

export const PLAN_LIMIT_MESSAGES = {
	chat: "The limit of your plan for chat is reached. Upgrade your plan to continue now.",
	builder:
		"The limit of your plan for the agent builder is reached. Upgrade your plan to continue now.",
	drafts:
		"The limit of your plan for drafts is reached. Upgrade your plan to continue now, or the agent writes this draft on",
} as const;
