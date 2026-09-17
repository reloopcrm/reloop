import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import {
	type ChatgptLoginSettings,
	chatgptLoginOutput,
} from "../settings/settings.contracts";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import { bridge } from "./bridge";

const VERIFY_TIMEOUT_MS = 20_000;

const verifyAnswer = z
	.object({
		outcome: z.string().nullable().catch(null),
		reason: z.string().nullable().catch(null),
	})
	.catch({ outcome: null, reason: null });

export type KeyCheck =
	| { outcome: "valid" }
	| { outcome: "invalid"; reason: string }
	| { outcome: "unknown"; reason: string };

export type ChatgptLoginAction = "start" | "status" | "cancel";

const NO_BRIDGE =
	"This install has no AGENT_BRIDGE_SECRET, so nothing can check.";

@Injectable()
export class ResearchKeyService {
	private readonly logger = new Logger(ResearchKeyService.name);

	verify(apiKey: string): Promise<KeyCheck> {
		return this.check(
			"/internal/crm/verify-key",
			{ apiKey },
			"Context did not recognise that API key.",
		);
	}

	verifyProvider(
		provider: "openrouter" | "openai" | "anthropic",
		apiKey: string,
	): Promise<KeyCheck> {
		return this.check(
			"/internal/crm/verify-provider-key",
			{ provider, apiKey },
			"The provider did not recognise that API key.",
		);
	}

	async chatgptLogin(
		action: ChatgptLoginAction,
	): Promise<ChatgptLoginSettings> {
		const unavailable = (reason: string): ChatgptLoginSettings => ({
			status: "unavailable",
			url: null,
			code: null,
			alreadyLoggedIn: false,
			reason,
			pollMs: 0,
		});
		const agent = bridge();

		if (!agent) return unavailable(NO_BRIDGE);

		try {
			const response = await fetch(agent.url("/internal/crm/chatgpt-login"), {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ action }),
				signal: AbortSignal.timeout(AGENT_DISPATCH.chatgptLogin.timeoutMs),
			});

			if (!response.ok) {
				return unavailable(`The agent answered ${response.status}.`);
			}

			const parsed = chatgptLoginOutput.safeParse(await response.json());
			return parsed.success
				? parsed.data
				: unavailable("The agent sent an answer this API cannot read.");
		} catch (error) {
			this.logger.warn({
				message: "Could not reach the agent for the ChatGPT login",
				reason: error instanceof Error ? error.message : String(error),
			});
			return unavailable("The agent is not reachable.");
		}
	}

	private async check(
		path: string,
		body: Record<string, string>,
		invalidReason: string,
	): Promise<KeyCheck> {
		const agent = bridge();

		if (!agent) return { outcome: "unknown", reason: NO_BRIDGE };

		try {
			const response = await fetch(agent.url(path), {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
			});

			if (!response.ok) {
				return this.cannotTell(`The agent answered ${response.status}.`);
			}

			const answer = verifyAnswer.parse(await response.json());

			if (answer.outcome === "valid") return { outcome: "valid" };

			if (answer.outcome === "invalid") {
				return { outcome: "invalid", reason: answer.reason || invalidReason };
			}

			return this.cannotTell(answer.reason ?? "No answer.");
		} catch (error) {
			return this.cannotTell(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private cannotTell(reason: string): KeyCheck {
		this.logger.warn({
			message: "Could not check the key; saving it unverified",
			reason,
		});

		return { outcome: "unknown", reason };
	}
}
