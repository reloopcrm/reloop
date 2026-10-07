import { describe, expect, it } from "bun:test";
import {
	readPlan,
	refreshedSummary,
	rereadRelevant,
	type ThreadClassification,
} from "../agent/lib/insight";

const AT = new Date("2026-09-14T09:00:00.000Z");
const LATER = new Date("2026-09-15T09:00:00.000Z");

const thread = {
	id: "t1",
	subject: "Europaletten",
	contactId: "c1",
	lastMessageAt: AT,
	messages: [
		{
			id: "m1",
			direction: "INBOUND",
			fromEmail: "preview@example.com",
			fromName: null,
			sentAt: AT,
			body: "Habt ihr 300 Europaletten zur Abholung?",
			snippet: null,
		},
	],
};

const rules = {} as never;

describe("a reread keeps the relevance it found", () => {
	it("never sends a relevant thread through the cheap pre-check", () => {
		expect(readPlan(true, { relevant: true, lastMessageAt: AT }, LATER)).toBe(
			"keepRelevant",
		);
	});

	it("leaves an off topic thread as it is stored", () => {
		expect(readPlan(true, { relevant: false, lastMessageAt: AT }, LATER)).toBe(
			"stored",
		);
	});

	it("runs the normal read only for new mail or a thread never read", () => {
		expect(readPlan(false, null, AT)).toBe("classify");
		expect(readPlan(true, null, AT)).toBe("classify");
		expect(readPlan(false, { relevant: true, lastMessageAt: AT }, LATER)).toBe(
			"classify",
		);
		expect(readPlan(false, { relevant: true, lastMessageAt: AT }, AT)).toBe(
			"stored",
		);
	});

	it("keeps a relevant thread relevant when the model reads it as off topic", async () => {
		const offTopic: ThreadClassification = {
			modelId: "test-model",
			verdict: {
				relevant: false,
				topics: [],
				side: "UNCLEAR",
				products: [],
				quantityPallets: null,
				loads: null,
				outcome: "OTHER",
				declineKind: null,
				declinedAt: null,
				unansweredByUs: false,
				summary: "Es ging um 300 Europaletten.",
				evidence: [],
				messageSummaries: [],
			},
		};

		const result = await rereadRelevant(thread, rules, async () => offTopic);

		expect(result.verdict.relevant).toBe(true);
		expect(result.verdict.summary).toBe("Es ging um 300 Europaletten.");
	});
});

describe("a language refresh rewrites only the summary", () => {
	it("writes the summary and its language, nothing else", () => {
		expect(
			refreshedSummary(
				"Availability of Europallets was discussed.",
				"Es ging um verfügbare Europaletten.",
				"de",
			),
		).toEqual({
			summary: "Es ging um verfügbare Europaletten.",
			language: "de",
		});
	});

	it("keeps the old summary when the model returns an empty one", () => {
		expect(refreshedSummary("Old summary.", "  ", "de").summary).toBe(
			"Old summary.",
		);
	});
});
