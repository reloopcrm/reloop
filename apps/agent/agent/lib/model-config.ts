const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const MODEL = {
	provider: { cacheMs: 15 * SECOND_MS },
	fallback: { cooldownMs: 15 * MINUTE_MS },
	secrets: { purpose: "agent-provider-keys" },
	usage: { minIntervalMs: 10 * SECOND_MS, probeTimeoutMs: 30 * SECOND_MS },
	openrouter: {
		baseUrl: "https://openrouter.ai/api/v1",
		headers: {
			"HTTP-Referer": "https://reloopcrm.com",
			"X-Title": "Reloop CRM",
		},
	},
	spend: { defaultKind: "agent", researchKind: "research" },
	cache: { anthropic: { cacheControl: { type: "ephemeral" } } },
	chatgptLogin: {
		command: "codex",
		version: "0.154.0",
		pollMs: 3 * SECOND_MS,
		replyMs: 5 * SECOND_MS,
		timeoutMs: 15 * MINUTE_MS,
		statusTimeoutMs: 10 * SECOND_MS,
		installTimeoutMs: 10 * MINUTE_MS,
		killGraceMs: 5 * SECOND_MS,
	},
	providerKey: { verifyTimeoutMs: 15 * SECOND_MS },
} as const;
