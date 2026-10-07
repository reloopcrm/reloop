import { describe, expect, it } from "bun:test";
import { DECLINE_KIND } from "@crm/db/insights";
import { parseDeclineKind } from "@crm/validation/thread-decline";
import type { z } from "zod";
import { insightAnswerFor, threadInsightSchema } from "../agent/lib/insight";

const OFFERED = new Date("2026-03-01T09:00:00.000Z");
const STOPPED = new Date("2026-03-02T09:00:00.000Z");
const ASKED = new Date("2026-03-03T09:00:00.000Z");
const FOLLOWED = new Date("2026-03-04T09:00:00.000Z");

type Mail = { direction: "INBOUND" | "OUTBOUND"; sentAt: Date; body: string };

function threadOf(mails: Mail[]) {
	return {
		id: "t1",
		subject: "Europaletten",
		contactId: "c1",
		lastMessageAt: mails.at(-1)?.sentAt ?? OFFERED,
		messages: mails.map((mail) => ({
			...mail,
			fromEmail:
				mail.direction === "INBOUND"
					? "preview@example.com"
					: "rep@example.com",
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
			answer({ declineKind: DECLINE_KIND.hard }),
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

	it("reads the stored kind and refuses one it does not know", () => {
		expect(parseDeclineKind(null)).toBeNull();
		expect(parseDeclineKind(DECLINE_KIND.hard)).toBe(DECLINE_KIND.hard);
		expect(() => parseDeclineKind("MAYBE")).toThrow();
	});
});
