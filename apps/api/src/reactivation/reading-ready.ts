import { cloud } from "@crm/db/cloud/scope";
import type { AgentProviderSetting } from "@crm/db/settings";
import {
	type AgentFunctionSettings,
	isTaskKindEnabled,
} from "@crm/validation/agent-functions";

export const READING_KIND = "thread-insight";

export type ReadingReadyInput = {
	fixed: boolean;
	setting: Pick<
		AgentProviderSetting,
		"provider" | "openrouterKey" | "openaiKey" | "anthropicKey"
	>;
	functions: AgentFunctionSettings;
	env?: Record<string, string | undefined>;
};

export function readingReady({
	fixed,
	setting,
	functions,
	env = process.env,
}: ReadingReadyInput): boolean {
	if (!isTaskKindEnabled(functions, READING_KIND)) return false;

	const environmentKey = Boolean(env.OPENROUTER_API_KEY?.trim());
	if (fixed) return environmentKey;

	return Boolean(
		setting.openrouterKey ||
			setting.openaiKey ||
			setting.anthropicKey ||
			setting.provider === "chatgpt" ||
			(environmentKey && !cloud.customer()),
	);
}
