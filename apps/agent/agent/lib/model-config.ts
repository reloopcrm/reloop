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
		pins: {
			"openai/gpt-6-sol": { order: ["openai"], allow_fallbacks: false },
			"openai/gpt-5.6-sol": { order: ["openai"], allow_fallbacks: false },
		},
	},
	spend: { defaultKind: "agent", researchKind: "research" },
	fixed: {
		provider: "openrouter",
		chat: "openai/gpt-6-luna",
		reading: "openai/gpt-6-luna",
		draft: "openai/gpt-6-sol",
		contextWindowTokens: 200_000,
		vendorWords:
			/openrouter|openai|anthropic|chatgpt|codex|gpt[- ]?\d|claude|luna|terra|\bsol\b|api key|provider|model/i,
	},
	cache: { anthropic: { cacheControl: { type: "ephemeral" } } },
	chatgptLogin: {
		command: "codex",
		authFile: "auth.json",
		version: "0.157.1",
		pollMs: 3 * SECOND_MS,
		replyMs: 5 * SECOND_MS,
		timeoutMs: 15 * MINUTE_MS,
		statusTimeoutMs: 10 * SECOND_MS,
		installTimeoutMs: 10 * MINUTE_MS,
		killGraceMs: 5 * SECOND_MS,
		passThroughEnv: [
			"PATH",
			"HOME",
			"CODEX_HOME",
			"TMPDIR",
			"LANG",
			"LC_ALL",
			"TERM",
			"NODE_EXTRA_CA_CERTS",
			"SSL_CERT_FILE",
			"SSL_CERT_DIR",
			"npm_config_registry",
			"HTTP_PROXY",
			"HTTPS_PROXY",
			"NO_PROXY",
			"http_proxy",
			"https_proxy",
			"no_proxy",
		],
	},
	providerKey: { verifyTimeoutMs: 15 * SECOND_MS },
} as const;
