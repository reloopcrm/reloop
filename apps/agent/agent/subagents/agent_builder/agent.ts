import { AGENT_PROVIDER_DEFAULTS } from "@crm/db/settings";
import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { fallbackModel, stepModel } from "../../lib/model";

export default defineAgent({
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
	modelContextWindowTokens:
		AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
	model: defineDynamic({
		fallback: fallbackModel(),
		events: {
			"step.started": () => stepModel(),
		},
	}),
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
