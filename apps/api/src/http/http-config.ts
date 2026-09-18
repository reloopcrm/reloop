import { MAX_REQUEST_BYTES } from "@crm/db/http";

export const REQUEST_SIZE = {
	body: { maxBytes: MAX_REQUEST_BYTES },
	auth: { path: "/api/auth", maxBytes: 1_000_000 },
	trpc: { path: "/api/trpc" },
} as const;

export const CLIENT_ADDRESS = { header: "x-forwarded-for" } as const;
