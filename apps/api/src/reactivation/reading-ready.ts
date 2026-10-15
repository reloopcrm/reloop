import { cloud } from "@crm/db/cloud/scope";
import type { AgentProviderSetting } from "@crm/db/settings";
import {
	type AgentFunctionSettings,
	isTaskKindEnabled,
} from "@crm/validation/agent-functions";
import type { ChatgptLoginState } from "@crm/validation/chatgpt-login";

export const READING_KIND = "thread-insight";

export type ReadingReadyInput = {
	fixed: boolean;
	setting: Pick<
		AgentProviderSetting,
		"openrouterKey" | "openaiKey" | "anthropicKey"
	>;
	chatgptUsable: boolean;
	functions: AgentFunctionSettings;
	env?: Record<string, string | undefined>;
};

export function readingReady({
	fixed,
	setting,
	chatgptUsable,
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
			chatgptUsable ||
			(environmentKey && !cloud.customer()),
	);
}

export function chatgptLoginUsable(
	login: Pick<ChatgptLoginState, "status" | "loginStored">,
): boolean {
	return (
		login.loginStored ??
		(login.status === "connected" || login.status === "unavailable")
	);
}

export function readingPaused(input: {
	limitHit: boolean;
	functions: AgentFunctionSettings;
}): boolean {
	return input.limitHit && isTaskKindEnabled(input.functions, READING_KIND);
}
