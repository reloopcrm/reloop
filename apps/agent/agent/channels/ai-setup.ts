import { timingSafeEqual } from "node:crypto";
import { defineChannel, POST } from "eve/channels";
import { z } from "zod";
import { chatgptLogin } from "../lib/chatgpt-login";
import { verifyProviderKey } from "../lib/provider-key";

function authorised(request: Request): boolean {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return false;
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const candidate = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(secret);
	if (candidate.length !== expected.length) return false;

	return timingSafeEqual(candidate, expected);
}

const loginRequest = z
	.object({ action: z.enum(["start", "status", "cancel"]) })
	.catch({ action: "status" });

const keyRequest = z.object({
	provider: z.enum(["openrouter", "openai", "anthropic"]),
	apiKey: z.string().trim().min(1).max(500),
});

export default defineChannel({
	routes: [
		POST("/internal/crm/chatgpt-login", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const { action } = loginRequest.parse(
				await request.json().catch(() => null),
			);

			if (action === "start") return Response.json(await chatgptLogin.start());
			if (action === "cancel") return Response.json(chatgptLogin.cancel());
			return Response.json(chatgptLogin.status());
		}),

		POST("/internal/crm/verify-provider-key", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const body = keyRequest.safeParse(await request.json().catch(() => null));
			if (!body.success) {
				return Response.json(
					{ outcome: "invalid", reason: "No API key was sent." },
					{ status: 400 },
				);
			}

			return Response.json(
				await verifyProviderKey(body.data.provider, body.data.apiKey),
			);
		}),
	],
});
