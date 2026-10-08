import { describe, expect, it } from "bun:test";
import { draftLimitHint } from "@/app/(app)/[slug]/win-back/[contactId]/person-view";
import german from "@/lib/i18n/de/win-back.json";

const dictionary: Record<string, string> = german;
const held = "2026-11-01T00:00:00.000Z";

describe("the draft hint at the draft limit", () => {
	it("names the limit instead of silently showing a stale draft", () => {
		expect(draftLimitHint(held, { stale: true }, false)).toBe("stale");
	});

	it("names the limit when there is no draft or it predates their answer", () => {
		expect(draftLimitHint(held, null, false)).toBe("missing");
		expect(draftLimitHint(held, { stale: false }, true)).toBe("missing");
		expect(draftLimitHint(held, { stale: true }, true)).toBe("missing");
	});

	it("shows a current draft without a hint", () => {
		expect(draftLimitHint(held, { stale: false }, false)).toBeNull();
	});

	it("shows no hint below the limit", () => {
		expect(draftLimitHint(null, { stale: true }, false)).toBeNull();
		expect(draftLimitHint(null, null, false)).toBeNull();
	});

	it("has a German line for the stale hint", () => {
		expect(dictionary["Newer mail has arrived since this draft."]).toBeTruthy();
	});
});
