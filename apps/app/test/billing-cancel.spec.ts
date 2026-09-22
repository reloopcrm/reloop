import { describe, expect, it } from "bun:test";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";

const { cancelWarning } = await import(
	"../app/(app)/[slug]/settings/billing/billing"
);

describe("the cancel warning", () => {
	const endsAt = "2026-10-15T12:00:00.000Z";

	it("names the exact date and the deletion delay in English", () => {
		const t = translator({});
		expect(cancelWarning(t, "en", endsAt, 30)).toBe(
			"Your plan ends on October 15, 2026. After that your workspace is suspended, and 30 days later all its data is deleted for good.",
		);
	});

	it("names the exact date and the deletion delay in German", () => {
		const t = translator(DICTIONARIES.de);
		expect(cancelWarning(t, "de", endsAt, 30)).toBe(
			"Dein Tarif endet am 15. Oktober 2026. Danach wird dein Workspace gesperrt, und 30 Tage später werden alle seine Daten endgültig gelöscht.",
		);
	});

	it("falls back to the end of the period without a date", () => {
		const t = translator({});
		expect(cancelWarning(t, "en", null, 30)).toStartWith(
			"Your plan ends on the end of the period.",
		);
	});
});
