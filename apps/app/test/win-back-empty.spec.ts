import { describe, expect, it } from "bun:test";
import {
	stillReading,
	winBackEmptyText,
} from "../app/(app)/[slug]/win-back/win-back-empty";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";

const READING =
	"Reloop is still reading your mail. Quiet customers show up here as soon as their conversations are read.";
const t = (text: string) => text;

describe("the Win back empty state", () => {
	it("says the mail is still being read while conversations wait", () => {
		expect(stillReading({ pending: 12, canRead: true })).toBe(true);
		expect(winBackEmptyText({ pending: 12, canRead: true }, t)).toBe(READING);
	});

	it("says nobody has gone quiet while the mail waits and reading cannot run", () => {
		expect(stillReading({ pending: 12, canRead: false })).toBe(false);
		expect(winBackEmptyText({ pending: 12, canRead: false }, t)).toBe(
			"Nobody has gone quiet.",
		);
	});

	it("says nobody has gone quiet once every conversation is read", () => {
		expect(stillReading({ pending: 0, canRead: true })).toBe(false);
		expect(winBackEmptyText({ pending: 0, canRead: true }, t)).toBe(
			"Nobody has gone quiet.",
		);
	});

	it("says nobody has gone quiet before the progress has loaded", () => {
		expect(stillReading(undefined)).toBe(false);
		expect(winBackEmptyText(undefined, t)).toBe("Nobody has gone quiet.");
	});

	it("has a translation in every dictionary", () => {
		for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
			if (locale === "en") continue;
			const translated = translator(dictionary)(READING);
			expect(translated).not.toBe(READING);
			expect(translated).not.toMatch(/[\u2013\u2014\u2015]/);
		}
	});
});
