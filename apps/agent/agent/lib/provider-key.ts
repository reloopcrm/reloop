import { MODEL } from "./model-config";

export type ProviderKeyCheck =
	| { outcome: "valid" }
	| { outcome: "invalid"; reason: string }
	| { outcome: "unknown"; reason: string };

export type KeyProvider = "openai" | "anthropic";

type Probe = {
	label: string;
	url: string;
	headers: (key: string) => HeadersInit;
};

const PROBES = {
	openai: {
		label: "OpenAI",
		url: "https://api.openai.com/v1/models",
		headers: (key: string): HeadersInit => ({ authorization: `Bearer ${key}` }),
	},
	anthropic: {
		label: "Anthropic",
		url: "https://api.anthropic.com/v1/models",
		headers: (key: string): HeadersInit => ({
			"x-api-key": key,
			"anthropic-version": "2023-06-01",
		}),
	},
} satisfies Record<KeyProvider, Probe>;

export function classifyProviderKey(
	provider: KeyProvider,
	answer: { status: number } | { error: unknown },
): ProviderKeyCheck {
	if ("error" in answer) {
		return {
			outcome: "unknown",
			reason:
				answer.error instanceof Error
					? answer.error.message
					: String(answer.error),
		};
	}
	if (answer.status === 401) {
		return {
			outcome: "invalid",
			reason: `${PROBES[provider].label} did not recognise that API key.`,
		};
	}
	return { outcome: "valid" };
}

export async function verifyProviderKey(
	provider: KeyProvider,
	apiKey: string,
	fetcher: typeof fetch = fetch,
): Promise<ProviderKeyCheck> {
	const probe = PROBES[provider];
	try {
		const response = await fetcher(probe.url, {
			headers: probe.headers(apiKey),
			signal: AbortSignal.timeout(MODEL.providerKey.verifyTimeoutMs),
		});
		return classifyProviderKey(provider, { status: response.status });
	} catch (error) {
		return classifyProviderKey(provider, { error });
	}
}
