import { MAX_REQUEST_BYTES } from "@crm/db/http";

export const REQUEST_SIZE = {
	body: { maxBytes: MAX_REQUEST_BYTES },
	auth: { path: "/api/auth", maxBytes: 1_000_000 },
	trpc: { path: "/api/trpc" },
} as const;

export const CLIENT_ADDRESS = { header: "x-forwarded-for" } as const;

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const REST_RATE_LIMIT = {
	apiKey: { max: 300, windowMs: MINUTE_MS },
	storeKeyPrefix: "rest:",
	retryAfterHeader: "Retry-After",
	message: "Too many requests. Wait before you send the next request.",
} as const;

export type RestRateLimitWindow = {
	readonly max: number;
	readonly windowMs: number;
};
