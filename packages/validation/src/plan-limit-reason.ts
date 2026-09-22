import { z } from "zod";

export const LIMIT_REASONS = ["plan", "provider"] as const;

export type LimitReason = (typeof LIMIT_REASONS)[number];

export const limitReason = z.enum(LIMIT_REASONS);

export const PLAN_LIMIT_MESSAGES = {
	chat: "The monthly limit of your plan for chat is reached. The conversation continues next month. Upgrade your plan to continue now.",
	builder:
		"The monthly limit of your plan for the agent builder is reached. The conversation continues next month. Upgrade your plan to continue now.",
	drafts:
		"The monthly limit of your plan for drafts is reached. The agent writes this draft next month. Upgrade your plan to continue now.",
} as const;
