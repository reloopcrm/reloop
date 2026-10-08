import { describe, expect, it } from "bun:test";
import {
	answerIsNext,
	followUpDaysOf,
	replyDraftOutdated,
} from "@/app/(app)/[slug]/win-back/[contactId]/person-view";
import {
	winBackInput,
	winBackSearchParams,
	winBackTable,
	windowDay,
	wroteBackListHref,
} from "@/app/(app)/[slug]/win-back/win-back-search-params";
import { draftToWrite } from "@/components/crm/use-email-draft";
import german from "@/lib/i18n/de/win-back.json";

const dictionary: Record<string, string> = german;

function loaded(href: string) {
	const url = new URL(href, "https://reloop.example");
	return winBackSearchParams(url.searchParams);
}

const SINCE = "2026-10-01T00:00:00.000Z";

describe("the Replied card link", () => {
	it("opens the list filtered to the people who wrote back", () => {
		const href = wroteBackListHref("/acme/win-back", "everyone", SINCE);
		const values = loaded(href);

		expect(href.startsWith("/acme/win-back?")).toBe(true);
		expect(values.replied).toBe(true);
		expect(winBackInput(winBackTable.toInput(values), values).replied).toBe(
			true,
		);
	});

	it("keeps the scope of the dashboard", () => {
		const values = loaded(wroteBackListHref("/acme/win-back", "me", SINCE));

		expect(values.scope).toBe("me");
		expect(values.replied).toBe(true);
	});

	it("carries the window the card counted to the list", () => {
		const values = loaded(wroteBackListHref("/acme/win-back", "me", SINCE));
		const input = winBackInput(winBackTable.toInput(values), values);

		expect(values.since).toBe(SINCE);
		expect(input.replied).toBe(true);
		expect(input.since).toBe(SINCE);
	});

	it("keeps the server's calendar day of the window", () => {
		const berlin = "2026-10-01T00:00:00.000+02:00";
		const values = loaded(wroteBackListHref("/acme/win-back", "me", berlin));
		const input = winBackInput(winBackTable.toInput(values), values);

		expect(input.since).toBe(berlin);
		expect(windowDay(berlin).toISOString()).toBe("2026-10-01T00:00:00.000Z");
	});

	it("drops a window that is not a date", () => {
		const values = loaded("/acme/win-back?replied=true&since=yesterday");

		expect(values.since).toBeNull();
	});

	it("sends no window without the Wrote back filter", () => {
		const values = loaded(`/acme/win-back?since=${SINCE}`);
		const input = winBackInput(winBackTable.toInput(values), values);

		expect(input.replied).toBe(false);
		expect(input.since).toBeUndefined();
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
		expect(dictionary["Wrote back, contacted since {date}"]).toBe(
			"Hat geantwortet, angeschrieben seit {date}",
		);
	});
});

describe("the draft for a reply", () => {
	const ready = { queued: false, waitingUntil: null, limit: null };
	const OLD = "2026-09-10T08:00:00.000Z";
	const NEW = "2026-09-25T08:00:00.000Z";
	const ANSWER = "2026-09-20T08:00:00.000Z";

	it("writes a new draft when the stored one is older than their answer", () => {
		expect(
			draftToWrite(
				{ ...ready, draft: { basedOnUntil: OLD } },
				{ covering: ANSWER },
			),
		).toBe(true);
	});

	it("keeps a current draft and keeps the old behaviour elsewhere", () => {
		expect(
			draftToWrite(
				{ ...ready, draft: { basedOnUntil: NEW } },
				{ covering: ANSWER },
			),
		).toBe(false);
		expect(draftToWrite({ ...ready, draft: { basedOnUntil: OLD } })).toBe(
			false,
		);
		expect(draftToWrite({ ...ready, draft: null })).toBe(true);
	});

	it("writes nothing while a draft is queued or the limit holds it", () => {
		expect(
			draftToWrite(
				{ ...ready, queued: true, draft: { basedOnUntil: OLD } },
				{ covering: ANSWER },
			),
		).toBe(false);
		expect(
			draftToWrite(
				{ ...ready, limit: "plan", draft: { basedOnUntil: OLD } },
				{ covering: ANSWER },
			),
		).toBe(false);
	});
});

describe("an outdated draft in the reply state", () => {
	const answer = { answeredAt: "2026-09-20T08:00:00.000Z", open: true };
	const before = { basedOnUntil: "2026-09-10T08:00:00.000Z" };
	const after = { basedOnUntil: "2026-09-25T08:00:00.000Z" };

	it("is never offered as the answer", () => {
		expect(replyDraftOutdated({ wroteBack: answer }, before)).toBe(true);
	});

	it("is free once Reloop read their answer for it", () => {
		expect(replyDraftOutdated({ wroteBack: answer }, after)).toBe(false);
	});

	it("is outdated when the mail Reloop read ends before their answer", () => {
		expect(
			replyDraftOutdated({ wroteBack: answer }, { basedOnUntil: null }),
		).toBe(true);
		expect(replyDraftOutdated({ wroteBack: answer }, before)).toBe(true);
	});

	it("is the normal draft when no answer is due", () => {
		expect(replyDraftOutdated({ wroteBack: null }, before)).toBe(false);
		expect(
			replyDraftOutdated({ wroteBack: { ...answer, open: false } }, before),
		).toBe(false);
		expect(replyDraftOutdated({ wroteBack: answer }, null)).toBe(false);
	});
});
