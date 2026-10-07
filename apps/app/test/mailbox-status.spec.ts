import { describe, expect, it } from "bun:test";
import {
	mailboxNeedsAttention,
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
