import { describe, expect, it } from "bun:test";
import { DECLINE_KIND } from "@crm/db/insights";
import { parseDeclineKind } from "@crm/validation/thread-decline";
import type { z } from "zod";
import { insightAnswer, threadInsightSchema } from "../agent/lib/insight";

type Answer = z.input<typeof insightAnswer>;

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
		askedToStop: false,
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
		expect(shape.askedToStop.safeParse(true).success).toBe(true);
	});

	it("keeps a hard no hard", () => {
		const verdict = insightAnswer.parse(
			answer({ declineKind: DECLINE_KIND.hard }),
		);

		expect(verdict.outcome).toBe("DECLINED");
		expect(verdict.declineKind).toBe(DECLINE_KIND.hard);
	});

	it("keeps a soft no soft", () => {
		const verdict = insightAnswer.parse(
			answer({ declineKind: DECLINE_KIND.soft }),
		);

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
	});

	it("makes a request to stop writing a hard no, whatever the model said", () => {
		const soft = insightAnswer.parse(
			answer({ declineKind: DECLINE_KIND.soft, askedToStop: true }),
		);
		const other = insightAnswer.parse(
			answer({ outcome: "OTHER", declineKind: null, askedToStop: true }),
		);

		expect(soft).toMatchObject({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
		});
		expect(other).toMatchObject({
			outcome: "DECLINED",
			declineKind: DECLINE_KIND.hard,
		});
		expect("askedToStop" in other).toBe(false);
	});

	it("reads a decline without a kind as soft, so the person stays visible", () => {
		const verdict = insightAnswer.parse(answer({ declineKind: null }));

		expect(verdict.declineKind).toBe(DECLINE_KIND.soft);
	});

	it("drops the kind when the outcome is not a decline", () => {
		const verdict = insightAnswer.parse(
			answer({
				outcome: "OPEN_INQUIRY_THEIRS",
				declineKind: DECLINE_KIND.hard,
			}),
		);

		expect(verdict.outcome).toBe("OPEN_INQUIRY_THEIRS");
		expect(verdict.declineKind).toBeNull();
	});

	it("reads the stored kind and refuses one it does not know", () => {
		expect(parseDeclineKind(null)).toBeNull();
		expect(parseDeclineKind(DECLINE_KIND.hard)).toBe(DECLINE_KIND.hard);
		expect(() => parseDeclineKind("MAYBE")).toThrow();
	});
});
