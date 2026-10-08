import { describe, expect, it } from "bun:test";
import { WIN_BACK_LATER_META } from "@crm/db/win-back-snooze";
import { isWinBackSnooze } from "../src/win-back-snooze";

describe("isWinBackSnooze", () => {
	it("knows the mark the API writes on a Remind me task", () => {
		expect(isWinBackSnooze(WIN_BACK_LATER_META)).toBe(true);
	});

	it("ignores every other task", () => {
		expect(isWinBackSnooze(null)).toBe(false);
		expect(isWinBackSnooze({ winBack: true })).toBe(false);
		expect(isWinBackSnooze({ later: true })).toBe(false);
		expect(isWinBackSnooze({ winBack: "true", later: true })).toBe(false);
	});
});
