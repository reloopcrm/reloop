import { createHmac } from "node:crypto";
import { PRIORITY } from "./agent-tasks";
import {
	appSecretKey,
	isSealedSecret,
	openSecret,
	sealSecret,
} from "./secrets";

const MINUTE_MS = 60_000;

export const WEBHOOKS = {
	kind: "webhook-delivery",
	purpose: "webhook-secret",
	priority: PRIORITY.event,
	deliver: {
		timeoutMs: 10_000,
		leaseMs: MINUTE_MS,
		batch: 20,
		concurrency: 4,
	},
	secret: {
		minLength: 16,
		maxLength: 200,
	},
	url: {
		maxLength: 2000,
		protocols: ["http:", "https:"],
	},
	headers: {
		signature: "x-reloop-signature",
		timestamp: "x-reloop-timestamp",
		event: "x-reloop-event",
		delivery: "x-reloop-delivery",
	},
	signatureVersion: "v1",
} as const;

export function sealWebhookSecret(secret: string): string {
	return sealSecret(secret, appSecretKey(WEBHOOKS.purpose));
}

export function openWebhookSecret(stored: string): string {
	const value = stored.trim();
	if (!isSealedSecret(value)) return value;

	return openSecret(value, appSecretKey(WEBHOOKS.purpose));
}

export function signWebhookBody(
	body: string,
	secret: string,
	timestamp: string,
): string {
	const digest = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");

	return `${WEBHOOKS.signatureVersion}=${digest}`;
}
