import { describe, expect, it } from "bun:test";
import {
	failureSignature,
	mailboxNeedsAttention,
	mailboxNeedsReconnect,
	mailboxReconnected,
	mailboxStatus,
} from "../app/(app)/[slug]/settings/connections/mailbox-status";
import { translator } from "../lib/i18n/locale";

const t = translator({});
const healthy = { status: "IDLE", lastError: null };

describe("mailboxStatus", () => {
	it("says Connected for a healthy mailbox", () => {
		expect(mailboxStatus(null, [healthy], t)).toBe("Connected");
	});

	it("says Reading mail while the import runs", () => {
		const running = { done: false, reached: null, percent: 10 };

		expect(mailboxStatus(running, [healthy], t)).toBe("Reading mail");
	});

	it("says Connected once the import is done", () => {
		const done = { done: true, reached: null, percent: 100 };

		expect(mailboxStatus(done, [healthy], t)).toBe("Connected");
	});

	for (const source of [
		{ status: "NEEDS_RECONNECT", lastError: null },
		{ status: "FAILED", lastError: null },
		{ status: "IDLE", lastError: "Google would not refresh the access token." },
	])
		it(`flags ${source.status} with ${source.lastError ?? "no error"}`, () => {
			expect(mailboxNeedsAttention([healthy, source])).toBe(true);
			expect(mailboxStatus(null, [source], t)).toBe("Needs attention");
		});

	it("puts attention before a running import", () => {
		const running = { done: false, reached: null, percent: 10 };

		expect(
			mailboxStatus(running, [{ status: "FAILED", lastError: "x" }], t),
		).toBe("Needs attention");
	});

	it("keeps a mailbox with no source rows healthy", () => {
		expect(mailboxNeedsAttention([])).toBe(false);
	});
});

describe("mailboxNeedsReconnect", () => {
	const reconnect = { status: "NEEDS_RECONNECT", lastError: "Revoked." };
	const failed = { status: "FAILED", lastError: "Gmail failed." };

	for (const provider of ["google", "microsoft"] as const) {
		it(`asks ${provider} to reconnect a revoked grant`, () => {
			expect(
				mailboxNeedsReconnect(provider, {
					hasRefreshToken: true,
					sources: [healthy, reconnect],
				}),
			).toBe(true);
		});

		it(`leaves a healthy ${provider} mailbox alone`, () => {
			expect(
				mailboxNeedsReconnect(provider, {
					hasRefreshToken: true,
					sources: [healthy],
				}),
			).toBe(false);
		});

		it(`does not offer ${provider} a reconnect for a failed sync`, () => {
			expect(
				mailboxNeedsReconnect(provider, {
					hasRefreshToken: true,
					sources: [failed],
				}),
			).toBe(false);
		});
	}

	it("asks Microsoft to reconnect without a refresh token", () => {
		expect(
			mailboxNeedsReconnect("microsoft", {
				hasRefreshToken: false,
				sources: [healthy],
			}),
		).toBe(true);
	});

	it("keeps Google without a refresh token on its own advice", () => {
		expect(
			mailboxNeedsReconnect("google", {
				hasRefreshToken: false,
				sources: [healthy],
			}),
		).toBe(false);
	});
});

describe("mailboxReconnected", () => {
	it("reports a healthy mailbox with a refresh token", () => {
		expect(
			mailboxReconnected({ hasRefreshToken: true, sources: [healthy] }),
		).toBe(true);
	});

	it("reports a mailbox that still needs attention", () => {
		expect(
			mailboxReconnected({
				hasRefreshToken: true,
				sources: [{ status: "NEEDS_RECONNECT", lastError: "Revoked." }],
			}),
		).toBe(false);
		expect(
			mailboxReconnected({ hasRefreshToken: false, sources: [healthy] }),
		).toBe(false);
	});
});

describe("failureSignature", () => {
	it("is empty for healthy sources", () => {
		expect(failureSignature([{ source: "outlook", ...healthy }])).toBe("");
	});

	it("names every failing source in a stable order", () => {
		expect(
			failureSignature([
				{ source: "gmail", status: "IDLE", lastError: "Quota." },
				{ source: "calendar", status: "NEEDS_RECONNECT", lastError: null },
			]),
		).toBe("calendar:reconnect|gmail:Quota.");
	});
});
