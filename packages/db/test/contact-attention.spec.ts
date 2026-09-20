import { describe, expect, it } from "bun:test";
import {
	ATTENTION,
	type AttentionFacts,
	type AttentionInsight,
	attentionFieldsOf,
	attentionOf,
} from "../src/contact-attention";
import type { ReactivationCandidate } from "../src/reactivation";

const NOW = new Date("2026-09-18T09:00:00.000Z");
const DAY_MS = 86_400_000;

function ago(days: number): Date {
	return new Date(NOW.getTime() - days * DAY_MS);
}

function candidate(over: Partial<ReactivationCandidate> = {}) {
	return {
		contact: {
			id: "c1",
			firstName: "Martin",
			lastName: "Berg",
			email: "m.berg@feinkost-sued.example",
			title: "Leiter Einkauf",
			imageUrl: null,
			company: { id: "co1", name: "Palatum Verpackungslogistik GmbH" },
			owner: null,
		},
		standing: "customer",
		potential: "high",
		lastContactAt: ago(8),
		firstContactAt: ago(300),
		lastInboundAt: ago(13),
		lastOutboundAt: ago(8),
		lastInboundThreadId: "t-inbound",
		lastOutboundThreadId: "t-outbound",
		quietDays: 8,
		threads: 6,
		messagesFromThem: 14,
		messagesFromUs: 9,
		meetings: 2,
		openDeals: 0,
		wonDeals: 1,
		lastSubject: "Angebot 620 Europaletten EPAL",
		waitingOnUs: false,
		matchedKeyword: "Einkauf",
		memory: {
			summary: null,
			didBusiness: 1,
			openInquiries: 1,
			maxPallets: 620,
			products: ["Europalette EPAL"],
			lastOutcome: "OPEN_OFFER_OURS",
			threadsRead: 6,
		},
		feedback: null,
		points: 178,
		pointLines: [{ label: "{n} deal done before", points: 40, vars: { n: 1 } }],
		reasons: [],
		...over,
	} satisfies ReactivationCandidate;
}

function insight(over: Partial<AttentionInsight> = {}): AttentionInsight {
	return {
		threadId: "t-offer",
		subject: "Angebot 620 Europaletten EPAL",
		lastMessageAt: ago(8),
		outcome: "OPEN_OFFER_OURS",
		side: "THEY_BUY",
		unansweredByUs: false,
		quantityPallets: 620,
		loads: 4,
		products: ["Europalette EPAL", "Gitterbox"],
		topics: ["Abholfenster"],
		evidence: ["Wir brauchen 620 Stück, Klasse A, sortenrein."],
		evidenceMessageIds: ["m-620"],
		...over,
	};
}

function facts(over: Partial<AttentionFacts> = {}): AttentionFacts {
	return {
		candidate: candidate(),
		insight: insight(),
		unanswered: insight({
			threadId: "t-ask",
			subject: "Anfrage Abholfenster",
			unansweredByUs: true,
		}),
		signals: [
			{
				relevant: true,
				outcome: "OPEN_OFFER_OURS",
				quantityPallets: 620,
				unansweredByUs: false,
				products: ["Europalette EPAL"],
				topics: ["Abholfenster"],
			},
		],
		rule: { minPallets: 200, minBoxes: 40, boxProducts: ["Gitterbox"] },
		products: ["Europalette"],
		unit: "Paletten",
		task: null,
		deal: null,
		...over,
	};
}

describe("the block answers what to do about this person", () => {
	it("says you wait on them when your offer is out and nobody answered", () => {
		expect(attentionOf(facts()).kind).toBe("waiting");
	});

	it("says you wait on them the same day the offer went out", () => {
		const read = attentionOf(facts({ candidate: candidate({ quietDays: 0 }) }));

		expect(read.kind).toBe("waiting");
	});

	it("says you owe them an answer when their mail is the newest", () => {
		const read = attentionOf(
			facts({
				candidate: candidate({ waitingOnUs: true, quietDays: 3 }),
				insight: insight({ outcome: "OPEN_INQUIRY_THEIRS" }),
			}),
		);

		expect(read.kind).toBe("owed");
	});

	it("says you owe them an answer when the thread reads unanswered by us", () => {
		const read = attentionOf(
			facts({ insight: insight({ unansweredByUs: true }) }),
		);

		expect(read.kind).toBe("owed");
	});

	it("knows nothing when no thread was ever read", () => {
		const bare = candidate({
			standing: null,
			potential: null,
			memory: {
				summary: null,
				didBusiness: 0,
				openInquiries: 0,
				maxPallets: null,
				products: [],
				lastOutcome: null,
				threadsRead: 0,
			},
		});
		const read = attentionOf(
			facts({ candidate: bare, insight: null, signals: [] }),
		);

		expect(read.kind).toBe("nothing-known");
	});

	it("knows nothing when every thread was read and judged irrelevant", () => {
		const read = attentionOf(
			facts({
				insight: null,
				signals: [
					{
						relevant: false,
						outcome: "OTHER",
						quantityPallets: null,
						unansweredByUs: false,
						products: [],
						topics: [],
					},
				],
			}),
		);

		expect(read.kind).toBe("nothing-known");
	});

	it("knows nothing when the contact has no mail at all", () => {
		expect(attentionOf(facts({ candidate: null, insight: null })).kind).toBe(
			"nothing-known",
		);
	});

	it("calls for a win back once the contact is quiet for months", () => {
		const read = attentionOf(
			facts({
				candidate: candidate({
					quietDays: ATTENTION.quiet.days + 151,
					waitingOnUs: true,
				}),
				insight: insight({ outcome: "DEAL_DONE" }),
			}),
		);

		expect(read.kind).toBe("win-back");
	});

	it("says they said no when the thread ended in a decline", () => {
		const read = attentionOf(
			facts({ insight: insight({ outcome: "DECLINED" }) }),
		);

		expect(read.kind).toBe("declined");
	});

	it("says nobody waits once the business is closed", () => {
		const read = attentionOf(
			facts({ insight: insight({ outcome: "DEAL_DONE" }) }),
		);

		expect(read.kind).toBe("settled");
	});
});

describe("the block shows only what applies", () => {
	it("shows no field and no evidence when nothing is known", () => {
		const read = attentionOf(facts({ candidate: null, insight: null }));

		expect(read.fields).toEqual([]);
		expect(read.evidence).toBeNull();
		expect(read.points).toBeNull();
	});

	it("drops the quantity row when no quantity was ever said", () => {
		const fields = attentionFieldsOf(
			"waiting",
			facts({ insight: insight({ quantityPallets: null, loads: null }) }),
		);

		expect(fields.map((field) => field.key)).not.toContain("quantity");
	});

	it("drops the goods row when the thread names no ware", () => {
		const fields = attentionFieldsOf(
			"waiting",
			facts({ insight: insight({ products: [] }) }),
		);

		expect(fields.map((field) => field.key)).not.toContain("products");
	});

	it("drops the side row when the side is unclear", () => {
		const fields = attentionFieldsOf(
			"waiting",
			facts({ insight: insight({ side: "UNCLEAR" }) }),
		);

		expect(fields.map((field) => field.key)).not.toContain("side");
	});

	it("drops the standing row when the contact has no standing", () => {
		const fields = attentionFieldsOf(
			"waiting",
			facts({ candidate: candidate({ standing: null }) }),
		);

		expect(fields.map((field) => field.key)).not.toContain("standing");
	});

	it("drops the task row when no task is open", () => {
		const fields = attentionFieldsOf("waiting", facts({ task: null }));

		expect(fields.map((field) => field.key)).not.toContain("task");
	});

	it("keeps the task row when one is open", () => {
		const fields = attentionFieldsOf(
			"waiting",
			facts({
				task: {
					activityId: "a1",
					subject: "Nachfassen Angebot 620 EPAL",
					dueAt: NOW,
				},
			}),
		);

		expect(fields.map((field) => field.key)).toContain("task");
	});

	it("changes shape between the waiting case and the owing case", () => {
		const waiting = attentionFieldsOf("waiting", facts()).map((one) => one.key);
		const owing = attentionFieldsOf("owed", facts()).map((one) => one.key);

		expect(waiting).not.toEqual(owing);
		expect(owing).toContain("asked");
		expect(waiting).not.toContain("asked");
	});

	it("takes the question from the newest thread nobody answered", () => {
		const fields = attentionFieldsOf(
			"owed",
			facts({
				insight: insight({ topics: ["Abholfenster"] }),
				unanswered: insight({
					threadId: "t-restposten",
					subject: "Restposten Gitterbox",
					unansweredByUs: true,
					topics: ["Restposten Gitterbox"],
				}),
			}),
		);
		const asked = fields.find((field) => field.key === "asked");

		expect(asked?.key === "asked" ? asked.values : []).toEqual([
			"Restposten Gitterbox",
		]);
		expect(asked?.key === "asked" ? asked.source?.threadId : null).toBe(
			"t-restposten",
		);
	});

	it("drops the question row when no thread waits for an answer", () => {
		const fields = attentionFieldsOf("owed", facts({ unanswered: null }));

		expect(fields.map((field) => field.key)).not.toContain("asked");
	});

	it("gives the win back case the score table instead of the field grid", () => {
		const read = attentionOf(
			facts({
				candidate: candidate({ quietDays: 241 }),
				insight: insight({ outcome: "DEAL_DONE" }),
				deal: {
					dealId: "d1",
					name: "Auftrag 1.800 EPAL",
					amountCents: 1_764_000,
					currency: "EUR",
				},
			}),
		);

		expect(read.points?.total).toBe(178);
		expect(read.points?.lines.length).toBe(1);
		expect(read.fields.map((field) => field.key)).toEqual([
			"bought",
			"outcome",
		]);
	});
});

describe("every claim the block makes carries a link", () => {
	it("hands every insight field the thread it came from", () => {
		const read = attentionOf(
			facts({
				task: { activityId: "a1", subject: "Nachfassen", dueAt: NOW },
			}),
		);

		expect(read.fields.length).toBeGreaterThan(3);

		for (const field of read.fields) {
			if (field.key === "task") {
				expect(field.activityId).toBe("a1");
				continue;
			}
			if (field.key === "bought") {
				expect(field.dealId.length).toBeGreaterThan(0);
				continue;
			}
			if (field.key === "standing") {
				expect(field.worth).toBe("deal");
				expect(field.threadsRead).toBe(1);
				continue;
			}
			expect(field.source?.threadId).toBe("t-offer");
		}
	});

	it("names the person the answer is about", () => {
		expect(attentionOf(facts()).name).toBe("Martin Berg");
	});

	it("keeps the first name alone when no last name is on file", () => {
		const read = attentionOf(
			facts({
				candidate: candidate({
					contact: { ...candidate().contact, lastName: null },
				}),
			}),
		);

		expect(read.name).toBe("Martin");
	});

	it("names nobody when no mail of this person was ever seen", () => {
		expect(attentionOf(facts({ candidate: null })).name).toBeNull();
	});

	it("counts the threads the standing was read from, not every thread", () => {
		const read = attentionOf(
			facts({
				signals: [
					{
						relevant: true,
						outcome: "OPEN_OFFER_OURS",
						quantityPallets: 620,
						unansweredByUs: false,
						products: ["Europalette EPAL"],
						topics: [],
					},
					{
						relevant: false,
						outcome: "OTHER",
						quantityPallets: null,
						unansweredByUs: false,
						products: [],
						topics: [],
					},
					{
						relevant: false,
						outcome: "OTHER",
						quantityPallets: null,
						unansweredByUs: false,
						products: [],
						topics: [],
					},
				],
			}),
		);
		const standing = read.fields.find((field) => field.key === "standing");

		expect(standing?.key).toBe("standing");
		if (standing?.key !== "standing") return;
		expect(standing.threadsRead).toBe(1);
	});

	it("strips the marks a stored quote already carries", () => {
		const read = attentionOf(
			facts({
				insight: insight({
					evidence: ["\u201ehaben Sie 620 Europaletten verf\u00fcgbar?\u201c"],
				}),
			}),
		);

		expect(read.evidence?.quote).toBe(
			"haben Sie 620 Europaletten verf\u00fcgbar?",
		);
	});

	it("leaves a quote that carries no marks alone", () => {
		const read = attentionOf(
			facts({
				insight: insight({ evidence: ["Wir brauchen 620 St\u00fcck."] }),
			}),
		);

		expect(read.evidence?.quote).toBe("Wir brauchen 620 St\u00fcck.");
	});

	it("hands the evidence quote the thread it came from", () => {
		const read = attentionOf(facts());

		expect(read.evidence?.source.threadId).toBe("t-offer");
		expect(read.evidence?.quote).toBe(
			"Wir brauchen 620 Stück, Klasse A, sortenrein.",
		);
	});

	it("names the one mail the quote comes from", () => {
		const read = attentionOf(
			facts({
				insight: insight({
					evidence: ["   ", "Wir brauchen 620 Stück."],
					evidenceMessageIds: ["m-first", "m-second"],
				}),
			}),
		);

		expect(read.evidence?.quote).toBe("Wir brauchen 620 Stück.");
		expect(read.evidence?.messageId).toBe("m-second");
	});

	it("keeps the quote without a deep link when no mail is named", () => {
		const read = attentionOf(
			facts({ insight: insight({ evidenceMessageIds: [""] }) }),
		);

		expect(read.evidence?.quote).toBe(
			"Wir brauchen 620 Stück, Klasse A, sortenrein.",
		);
		expect(read.evidence?.messageId).toBeNull();
	});

	it("keeps no evidence block when the thread carries no quote", () => {
		const read = attentionOf(facts({ insight: insight({ evidence: [] }) }));

		expect(read.evidence).toBeNull();
	});

	it("names the thread behind each side of the wait", () => {
		const read = attentionOf(facts());

		expect(read.lastInbound?.threadId).toBe("t-inbound");
		expect(read.lastOutbound?.threadId).toBe("t-outbound");
	});

	it("leaves the thread null rather than linking to nothing", () => {
		const read = attentionOf(
			facts({
				candidate: candidate({
					lastInboundThreadId: null,
					lastOutboundThreadId: null,
				}),
			}),
		);

		expect(read.lastInbound?.threadId).toBeNull();
		expect(read.lastOutbound?.threadId).toBeNull();
	});
});
