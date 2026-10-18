import { describe, expect, it } from "bun:test";
import { PROVIDER_API, SYNC_LEASE } from "../src/mailbox/mailbox.config";

describe("mailbox config values", () => {
	it("keeps the provider request limits", () => {
		expect(PROVIDER_API.timeoutMs).toBe(20_000);
		expect(PROVIDER_API.minBackoffMs).toBe(30_000);
		expect(PROVIDER_API.maxBackoffMs).toBe(900_000);
		expect(PROVIDER_API.rateLimitFallbackMs).toBe(60_000);
	});

	it("keeps the sync lease", () => {
		expect(SYNC_LEASE.leaseMs).toBe(300_000);
	});
});
