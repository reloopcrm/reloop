import type { Translate } from "./i18n/locale";

export const BRIDGE_ERRORS = {
	notSignedIn: "Not signed in.",
	conversationNotFound: "Conversation not found.",
	unreachable: "The research agent is not reachable.",
	noSessionId: "The research agent did not return a session id.",
	notConfigured: "The research agent is not configured for this install.",
} as const;

export const BRIDGE_ERROR_FALLBACK =
	"The research agent could not answer. Try again.";

export const BRIDGE_DEVELOPER_HINTS = {
	[BRIDGE_ERRORS.unreachable]:
		"Start it with `bun run dev`, or check AGENT_URL.",
	[BRIDGE_ERRORS.notConfigured]:
		"Set AGENT_BRIDGE_SECRET for both the app and the agent.",
} as const;

const BRIDGE_ERROR_TEXTS: ReadonlySet<string> = new Set(
	Object.values(BRIDGE_ERRORS),
);

export function bridgeFailure(
	message: string,
	t: Translate,
	options: { developer: boolean; known?: readonly string[] },
): { text: string; hint: string | null } {
	const shown =
		BRIDGE_ERROR_TEXTS.has(message) || options.known?.includes(message);
	const hint = options.developer
		? (BRIDGE_DEVELOPER_HINTS as Record<string, string>)[message]
		: undefined;

	return {
		text: t(shown ? message : BRIDGE_ERROR_FALLBACK),
		hint: hint ? t(hint) : null,
	};
}
