import "@crm/env/load";

import { AGENT_PROVIDER_DEFAULTS } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { fallbackModel, logModelProvider, stepModel } from "./lib/model";

void logCapabilities();
void logModelProvider();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

export default defineAgent({
	modelContextWindowTokens:
		AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
	model: defineDynamic({
		fallback: fallbackModel(),
		events: {
			"step.started": () => stepModel(),
		},
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});
