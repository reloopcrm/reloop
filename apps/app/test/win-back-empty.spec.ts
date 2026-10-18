import { describe, expect, it } from "bun:test";
import {
	readingHint,
	stillReading,
	winBackEmptyText,
} from "../app/(app)/[slug]/win-back/win-back-empty";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";

const READING =
	"Reloop is still reading your mail. Quiet customers show up here as soon as their conversations are read.";
const NO_PROVIDER =
	"Reloop cannot read your mail because no AI provider is connected.";
const FUNCTION_OFF =
	"Reloop cannot read your mail because conversation summaries are switched off.";
const t = (text: string) => text;

describe("the Win back empty state", () => {
	it("says the mail is still being read while conversations wait", () => {
		expect(
			stillReading({
				pending: 12,
				canRead: true,
				paused: false,
				readingBlock: null,
			}),
		).toBe(true);
		expect(
			winBackEmptyText(
				{ pending: 12, canRead: true, paused: false, readingBlock: null },
				t,
			),
		).toBe(READING);
	});

	it("says nobody has gone quiet while the mail waits and reading cannot run", () => {
		expect(
			stillReading({
				pending: 12,
				canRead: false,
				paused: false,
				readingBlock: null,
			}),
		).toBe(false);
		expect(
			winBackEmptyText(
				{ pending: 12, canRead: false, paused: false, readingBlock: null },
				t,
			),
		).toBe("Nobody has gone quiet.");
	});

	it("says the mail is still being read while the subscription limit pauses it", () => {
		expect(
			stillReading({
				pending: 12,
				canRead: false,
				paused: true,
				readingBlock: null,
			}),
		).toBe(true);
		expect(
			winBackEmptyText(
				{ pending: 12, canRead: false, paused: true, readingBlock: null },
				t,
			),
		).toBe(READING);
	});

	it("says nobody has gone quiet once every conversation is read", () => {
		expect(
			stillReading({
				pending: 0,
				canRead: true,
				paused: false,
				readingBlock: null,
			}),
		).toBe(false);
		expect(
			winBackEmptyText(
				{ pending: 0, canRead: true, paused: false, readingBlock: null },
				t,
			),
		).toBe("Nobody has gone quiet.");
	});

	it("says nobody has gone quiet before the progress has loaded", () => {
		expect(stillReading(undefined)).toBe(false);
		expect(winBackEmptyText(undefined, t)).toBe("Nobody has gone quiet.");
	});

	it("hints at the AI settings when no provider is connected", () => {
		expect(
			readingHint(
				{
					pending: 12,
					canRead: false,
					paused: false,
					readingBlock: "noProvider",
				},
				t,
			),
		).toEqual({
			text: NO_PROVIDER,
			action: "Connect an AI provider",
			path: "/settings/ai",
		});
	});

	it("hints at the functions settings when summaries are switched off", () => {
		expect(
			readingHint(
				{
					pending: 12,
					canRead: false,
					paused: false,
					readingBlock: "functionOff",
				},
				t,
			),
		).toEqual({
			text: FUNCTION_OFF,
			action: "Switch summaries on",
			path: "/settings/functions",
		});
	});

	it("shows no hint while reading runs, is paused or has not loaded", () => {
		expect(
			readingHint(
				{ pending: 12, canRead: true, paused: false, readingBlock: null },
				t,
			),
		).toBeNull();
		expect(
			readingHint(
				{ pending: 12, canRead: false, paused: true, readingBlock: null },
				t,
			),
		).toBeNull();
		expect(readingHint(undefined, t)).toBeNull();
	});

	it("translates the hints in every dictionary", () => {
		for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
			if (locale === "en") continue;
			const translate = translator(dictionary);
			for (const text of [
				NO_PROVIDER,
				FUNCTION_OFF,
				"Connect an AI provider",
				"Switch summaries on",
			]) {
				expect(translate(text)).not.toBe(text);
				expect(translate(text)).not.toMatch(/[\u2013\u2014\u2015]/);
			}
		}
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
