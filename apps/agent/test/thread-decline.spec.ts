import { describe, expect, it } from "bun:test";
import { DECLINE_KIND } from "@crm/db/insights";
import { parseDeclineKind } from "@crm/validation/thread-decline";
import type { z } from "zod";
import { insightAnswerFor, threadInsightSchema } from "../agent/lib/insight";
import { keptDecline } from "../agent/lib/thread-decline";

const OFFERED = new Date("2026-03-01T09:00:00.000Z");
const STOPPED = new Date("2026-03-02T09:00:00.000Z");
const ASKED = new Date("2026-03-03T09:00:00.000Z");
const FOLLOWED = new Date("2026-03-04T09:00:00.000Z");

const LATER = new Date("2026-03-05T09:00:00.000Z");

type Mail = {
	direction: "INBOUND" | "OUTBOUND";
	sentAt: Date;
	body: string;
	from?: string;
	subject?: string;
};

function threadOf(mails: Mail[]) {
	return {
		id: "t1",
		subject: "Europaletten",
		contactId: "c1",
		contact: { email: "preview@example.com" },
		lastMessageAt: mails.at(-1)?.sentAt ?? OFFERED,
		messages: mails.map((mail) => ({
			direction: mail.direction,
			sentAt: mail.sentAt,
			body: mail.body,
			subject: mail.subject ?? "Re: Europaletten",
			fromEmail:
				mail.from ??
				(mail.direction === "INBOUND"
					? "preview@example.com"
					: "rep@example.com"),
			fromName: null,
			snippet: null,
		})),
	};
}

const offer: Mail = {
	direction: "OUTBOUND",
	sentAt: OFFERED,
	body: "Wir haben Europaletten.",
};
const stop: Mail = {
	direction: "INBOUND",
	sentAt: STOPPED,
	body: "Bitte schreiben Sie mir nicht mehr.",
};
const inquiry: Mail = {
	direction: "INBOUND",
	sentAt: ASKED,
	body: "Was kosten 300 Stück?",
};
const followUp: Mail = {
	direction: "OUTBOUND",
	sentAt: FOLLOWED,
	body: "Kommen Sie noch einmal auf uns zu?",
};

const autoReply: Mail = {
	direction: "INBOUND",
	sentAt: LATER,
	body: "Ich bin bis Montag nicht im Büro.",
	subject: "Automatische Antwort: Europaletten",
};
const colleague: Mail = {
	direction: "INBOUND",
	sentAt: LATER,
	body: "Ich übernehme das Thema.",
	from: "colleague@example.com",
};
const answerLater: Mail = {
	direction: "INBOUND",
	sentAt: LATER,
	body: "Haben Sie wieder Europaletten?",
};

const stopped = threadOf([offer, stop]);

type Answer = z.input<ReturnType<typeof insightAnswerFor>>;

function answer(fields: Partial<Answer>): Answer {
	return {
		relevant: true,
		topics: ["Europaletten"],
		side: "THEY_BUY",
		products: ["Europaletten"],
		quantityPallets: null,
		loads: null,
		outcome: "DECLINED",
		declineKind: null,
		declineMessage: null,
		stopRequest: null,
		unansweredByUs: false,
		summary: "Sie haben abgelehnt.",
		evidence: [],
		messageSummaries: [],
		...fields,
	};
}

describe("the decline the agent reads from a thread", () => {
	it("asks the model for the kind of a decline and for a request to stop", () => {
		const shape = threadInsightSchema.shape;

		expect(shape.declineKind.safeParse(DECLINE_KIND.hard).success).toBe(true);
		expect(shape.declineKind.safeParse(DECLINE_KIND.soft).success).toBe(true);
		expect(shape.declineKind.safeParse(null).success).toBe(true);
		expect(shape.declineKind.safeParse("MAYBE").success).toBe(false);
		expect(shape.stopRequest.safeParse(2).success).toBe(true);
		expect(shape.stopRequest.safeParse(null).success).toBe(true);
	});

	it("keeps a hard no hard and dates it by their last mail", () => {
		const verdict = insightAnswerFor(threadOf([offer, stop, followUp])).parse(
			answer({ declineKind: DECLINE_KIND.hard, declineMessage: 2 }),
		);

		expect(verdict.outcome).toBe("DECLINED");
		expect(verdict.declineKind).toBe(DECLINE_KIND.hard);
		expect(verdict.declinedAt).toEqual(STOPPED);
	});

	it("keeps a soft no soft without a date", () => {
		const verdict = insightAnswerFor(stopped).parse(
			answer({ declineKind: DECLINE_KIND.soft }),
		);

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
		expect(verdict.declinedAt).toBeNull();
	});

	it("makes a request to stop writing a hard no, whatever the model said", () => {
		const read = insightAnswerFor(stopped);
		const soft = read.parse(
			answer({ declineKind: DECLINE_KIND.soft, stopRequest: 2 }),
		);
		const other = read.parse(
			answer({ outcome: "OTHER", declineKind: null, stopRequest: 2 }),
		);

		expect(soft).toMatchObject({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
			declinedAt: STOPPED,
		});
		expect(other).toMatchObject({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
		});
		expect("stopRequest" in other).toBe(false);
	});

	it("lets a later mail from them outweigh an earlier request to stop", () => {
		const verdict = insightAnswerFor(threadOf([offer, stop, inquiry])).parse(
			answer({ outcome: "OPEN_INQUIRY_THEIRS", stopRequest: 2 }),
		);

		expect(verdict.outcome).toBe("OPEN_INQUIRY_THEIRS");
		expect(verdict.declineKind).toBeNull();
	});

	it("keeps a request to stop when an automatic reply follows it", () => {
		const verdict = insightAnswerFor(threadOf([offer, stop, autoReply])).parse(
			answer({ declineKind: DECLINE_KIND.soft, stopRequest: 2 }),
		);

		expect(verdict).toMatchObject({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
			declinedAt: STOPPED,
		});
	});

	it("dates a hard no by the person, not by a colleague in the thread", () => {
		const verdict = insightAnswerFor(threadOf([offer, stop, colleague])).parse(
			answer({ declineKind: DECLINE_KIND.soft, stopRequest: 2 }),
		);

		expect(verdict).toMatchObject({
			declineKind: DECLINE_KIND.hard,
			declinedAt: STOPPED,
		});
	});

	it("never makes a hard no of a thread the person never answered in", () => {
		const verdict = insightAnswerFor(threadOf([offer, colleague])).parse(
			answer({ declineKind: DECLINE_KIND.hard, declineMessage: 2 }),
		);

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
		expect(verdict.declinedAt).toBeNull();
	});

	it("never makes a hard no of a colleague's no after the person's greeting", () => {
		const greeting: Mail = {
			direction: "INBOUND",
			sentAt: STOPPED,
			body: "Danke für die Nachricht.",
		};
		const verdict = insightAnswerFor(
			threadOf([offer, greeting, colleague]),
		).parse(answer({ declineKind: DECLINE_KIND.hard, declineMessage: 3 }));

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
		expect(verdict.declinedAt).toBeNull();
	});

	it("needs the model to name the person's own no for a hard no", () => {
		const verdict = insightAnswerFor(stopped).parse(
			answer({ declineKind: DECLINE_KIND.hard, declineMessage: null }),
		);

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
	});

	it("drops a stored hard no whose refusal is no longer their mail", () => {
		const stored = { declineKind: DECLINE_KIND.hard, declinedAt: STOPPED };
		const repaired = { ...stop, direction: "OUTBOUND" as const };
		const reread = {
			outcome: "OTHER" as const,
			declineKind: null,
			declinedAt: null,
		};

		expect(keptDecline(reread, stored, threadOf([offer, repaired]))).toEqual(
			reread,
		);
	});

	it("ignores a request to stop that points at our own mail", () => {
		const verdict = insightAnswerFor(stopped).parse(
			answer({ outcome: "OTHER", stopRequest: 1 }),
		);

		expect(verdict.outcome).toBe("OTHER");
	});

	it("reads a decline without a kind as soft, so the person stays visible", () => {
		const verdict = insightAnswerFor(stopped).parse(
			answer({ declineKind: null }),
		);

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
	});

	it("drops the kind when the outcome is not a decline", () => {
		const verdict = insightAnswerFor(stopped).parse(
			answer({
				outcome: "OPEN_INQUIRY_THEIRS",
				declineKind: DECLINE_KIND.hard,
			}),
		);

		expect(verdict.outcome).toBe("OPEN_INQUIRY_THEIRS");
		expect(verdict.declineKind).toBeNull();
		expect(verdict.declinedAt).toBeNull();
	});

	it("keeps a stored hard no when a new read sees only our mail", () => {
		const stored = { declineKind: DECLINE_KIND.hard, declinedAt: STOPPED };
		const reread = {
			outcome: "OPEN_OFFER_OURS" as const,
			declineKind: null,
			declinedAt: null,
		};

		expect(
			keptDecline(reread, stored, threadOf([offer, stop, followUp])),
		).toEqual({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
			declinedAt: STOPPED,
		});
		expect(
			keptDecline(reread, stored, threadOf([offer, stop, autoReply])),
		).toMatchObject({ declineKind: DECLINE_KIND.hard });
		expect(
			keptDecline(reread, stored, threadOf([offer, stop, answerLater])),
		).toEqual(reread);
		expect(keptDecline(reread, null, stopped)).toEqual(reread);
	});

	it("reads the stored kind and refuses one it does not know", () => {
		expect(parseDeclineKind(null)).toBeNull();
		expect(parseDeclineKind(DECLINE_KIND.hard)).toBe(DECLINE_KIND.hard);
		expect(() => parseDeclineKind("MAYBE")).toThrow();
	});
});
