import { describe, expect, it } from "bun:test";
import {
	answerIsNext,
	followUpDaysOf,
} from "@/app/(app)/[slug]/win-back/[contactId]/person-view";
import {
	winBackInput,
	winBackSearchParams,
	winBackTable,
	wroteBackListHref,
} from "@/app/(app)/[slug]/win-back/win-back-search-params";
import german from "@/lib/i18n/de/win-back.json";

const dictionary: Record<string, string> = german;

function loaded(href: string) {
	const url = new URL(href, "https://reloop.example");
	return winBackSearchParams(url.searchParams);
}

describe("the Replied card link", () => {
	it("opens the list filtered to the people who wrote back", () => {
		const href = wroteBackListHref("/acme/win-back", "everyone");
		const values = loaded(href);

		expect(href.startsWith("/acme/win-back?")).toBe(true);
		expect(values.replied).toBe(true);
		expect(winBackInput(winBackTable.toInput(values), values).replied).toBe(
			true,
		);
	});

	it("keeps the scope of the dashboard", () => {
		const values = loaded(wroteBackListHref("/acme/win-back", "me"));

		expect(values.scope).toBe("me");
		expect(values.replied).toBe(true);
	});

	it("leaves the filter off in a plain list link", () => {
		const values = loaded("/acme/win-back");

		expect(values.replied).toBe(false);
		expect(winBackInput(winBackTable.toInput(values), values).replied).toBe(
			false,
		);
	});
});

describe("the next step after a reply", () => {
	const answer = { answeredAt: "2026-09-20T08:00:00.000Z", open: true };

	it("asks for the answer when they wrote back after the win back mail", () => {
		expect(answerIsNext({ wroteBack: answer })).toBe(true);
	});

	it("offers a new mail when nobody wrote back or the answer is given", () => {
		expect(answerIsNext({ wroteBack: null })).toBe(false);
		expect(answerIsNext({ wroteBack: { ...answer, open: false } })).toBe(false);
	});

	it("promises no follow up reminder to someone who wrote back", () => {
		expect(followUpDaysOf({ wroteBack: answer, followUpDays: 5 })).toBe(null);
		expect(followUpDaysOf({ wroteBack: null, followUpDays: 5 })).toBe(5);
	});

	it("speaks German", () => {
		expect(dictionary["Wrote back"]).toBe("Hat geantwortet");
		expect(dictionary["Reply to them"]).toBe("Antworte ihnen");
		expect(dictionary["See who wrote back"]).toBeDefined();
	});
});
