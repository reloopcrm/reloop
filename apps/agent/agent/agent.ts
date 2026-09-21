import "@crm/env/load";

import { AGENT_PROVIDER_DEFAULTS } from "@crm/db/settings";
import { isHosted } from "@crm/db/tenant-context";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { fallbackModel, logModelProvider, stepModel } from "./lib/model";
import { withTenant } from "./lib/tenant";

if (isHosted()) {
	console.log("[agent] hosted mode: one database per tenant, read per session");
} else {
	void logCapabilities();
	void logModelProvider();
	void syncVersion();
}

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

export default defineAgent({
	modelContextWindowTokens:
		AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
	model: defineDynamic({
		fallback: fallbackModel(),
		events: {
			"step.started": (_event, ctx) => withTenant(ctx, () => stepModel()),
		},
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});
