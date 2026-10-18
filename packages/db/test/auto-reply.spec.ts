import { describe, expect, it } from "bun:test";
import { DIRECT_KINDS, isDirectKind } from "../src/agent-tasks";
import {
	isAutoReply,
	isBounce,
	isRealAnswer,
	isReplySubject,
	stripQuotedHistory,
} from "../src/message-text";
import { DEFAULT_WIN_BACK_RULES } from "../src/win-back-rules";

describe("isAutoReply", () => {
	it("knows the German out-of-office subject in every reply form", () => {
		expect(isAutoReply("Automatische Antwort: Paletten", null)).toBe(true);
		expect(isAutoReply("AW: Automatische Antwort: Paletten", null)).toBe(true);
		expect(isAutoReply("Abwesenheitsnotiz", null)).toBe(true);
	});

	it("knows the English, Dutch and French forms", () => {
		expect(isAutoReply("Automatic reply: pallets", null)).toBe(true);
		expect(isAutoReply("Automatisch antwoord: pallets", null)).toBe(true);
		expect(isAutoReply("Réponse automatique", null)).toBe(true);
		expect(isAutoReply("Out of office", null)).toBe(true);
	});

	it("knows a bounce", () => {
		expect(isAutoReply("Undeliverable: Paletten", null)).toBe(true);
		expect(isAutoReply("Unzustellbar: Paletten", null)).toBe(true);
	});

	it("keeps its bounce subjects as they were, the newer ones belong to isBounce", () => {
		expect(isAutoReply("Mail delivery failed: Paletten", null)).toBe(true);
		expect(isAutoReply("Delivery Status Notification (Failure)", null)).toBe(
			true,
		);
		expect(isAutoReply("Zustellungsstatus: Paletten", null)).toBe(true);
		for (const subject of [
			"Nicht zustellbar: Paletten",
			"Non remis: Paletten",
			"Onbestelbaar: Paletten",
			"Undelivered Mail Returned to Sender",
			"Returned mail: see transcript",
			"failure notice",
			"Message not delivered",
		]) {
			expect({ subject, auto: isAutoReply(subject, null) }).toEqual({
				subject,
				auto: false,
			});
			expect({
				subject,
				bounce: isBounce("notify@example.com", subject, null),
			}).toEqual({ subject, bounce: true });
		}
	});

	it("reads the body when the subject says nothing", () => {
		expect(
			isAutoReply(
				"Re: Paletten",
				"Guten Tag, ich bin bis zum 20.09. nicht im Büro und lese keine Mails.",
			),
		).toBe(true);
	});

	it("reads an English body when the subject says nothing", () => {
		expect(
			isAutoReply(
				"Re: Proposal",
				"Thanks for your email. I am currently out of the office until Monday.",
			),
		).toBe(true);
		expect(
			isAutoReply(
				"Re: Proposal",
				"This message was generated automatically. For urgent matters, please contact support.",
			),
		).toBe(true);
		expect(
			isAutoReply("Re: Proposal", "Your email will not be forwarded."),
		).toBe(true);
	});

	it("leaves a real answer alone", () => {
		expect(
			isAutoReply("Re: Paletten", "Wir haben 500 Stück, was zahlen Sie?"),
		).toBe(false);
		expect(isAutoReply("Angebot Gitterboxen", null)).toBe(false);
	});
});

describe("isBounce", () => {
	it("knows the mail system as a sender", () => {
		expect(isBounce("MAILER-DAEMON@example.com", "Re: Paletten", null)).toBe(
			true,
		);
		expect(isBounce("postmaster@example.com", "Re: Paletten", null)).toBe(true);
		expect(isBounce("anna.postmaster@example.com", "Re: Paletten", null)).toBe(
			false,
		);
	});

	it("knows the bounce subjects", () => {
		expect(
			isBounce(
				"notify@example.com",
				"Delivery Status Notification (Failure)",
				null,
			),
		).toBe(true);
		expect(
			isBounce(
				"notify@example.com",
				"Undelivered Mail Returned to Sender",
				null,
			),
		).toBe(true);
		expect(isBounce("notify@example.com", "Re: Delivery failed", null)).toBe(
			false,
		);
	});

	it("reads a bounce body", () => {
		expect(
			isBounce(
				"notify@example.com",
				"Re: Paletten",
				"Delivery to the following recipient failed permanently.",
			),
		).toBe(true);
	});
});

describe("isRealAnswer", () => {
	const reply = {
		direction: "INBOUND" as const,
		fromEmail: "anna@example.com",
		subject: "Re: Paletten",
		body: "Wir haben 500 Stück, was zahlen Sie?",
		snippet: null,
	};

	it("counts a person writing back", () => {
		expect(isRealAnswer(reply)).toBe(true);
		expect(isRealAnswer({ ...reply, subject: null, body: null })).toBe(true);
	});

	it("reads only what the person wrote, not the quoted history", () => {
		expect(
			isRealAnswer({
				...reply,
				body: "Ja, gerne.\n\nAm 03.02.2026 schrieb Anna:\n> Ich bin derzeit nicht im Büro.",
			}),
		).toBe(true);
		expect(
			isRealAnswer({
				...reply,
				body: "Ich bin derzeit nicht im Büro.\n\nAm 03.02.2026 schrieb Anna:\n> Paletten?",
			}),
		).toBe(false);
	});

	it("never counts an auto-reply, a bounce or our own mail", () => {
		expect(
			isRealAnswer({ ...reply, subject: "Automatische Antwort: Paletten" }),
		).toBe(false);
		expect(
			isRealAnswer({ ...reply, fromEmail: "mailer-daemon@example.com" }),
		).toBe(false);
		expect(
			isRealAnswer({
				...reply,
				body: null,
				snippet: "I am currently out of the office.",
			}),
		).toBe(false);
		expect(isRealAnswer({ ...reply, direction: "OUTBOUND" })).toBe(false);
	});
});

describe("isReplySubject", () => {
	it("sees every reply marker", () => {
		expect(isReplySubject("Re: Paletten")).toBe(true);
		expect(isReplySubject("AW: Paletten")).toBe(true);
		expect(isReplySubject("Re[2]: Paletten")).toBe(true);
		expect(isReplySubject("Antwoord: Paletten")).toBe(true);
		expect(isReplySubject("Fwd: Paletten")).toBe(true);
		expect(isReplySubject("WG: Paletten")).toBe(true);
	});

	it("leaves a fresh subject alone", () => {
		expect(isReplySubject("Paletten fair abgeben")).toBe(false);
		expect(isReplySubject(null)).toBe(false);
	});
});

describe("stripQuotedHistory", () => {
	it("cuts the English reply header", () => {
		expect(
			stripQuotedHistory(
				"Sounds good.\n\nOn Tue, 3 Aug 2026, Anna wrote:\n> old",
			),
		).toBe("Sounds good.");
		expect(
			stripQuotedHistory(
				"Approved.\n\nFrom: Anna\nSent: Tuesday\nSubject: Offer",
			),
		).toBe("Approved.");
	});

	it("cuts the German reply header", () => {
		expect(
			stripQuotedHistory("Passt.\n\nAm 03.08.2026 schrieb Anna:\n> alt"),
		).toBe("Passt.");
		expect(
			stripQuotedHistory("Einverstanden.\n\nVon: Anna\nGesendet: Dienstag"),
		).toBe("Einverstanden.");
	});
});

describe("the business setup lane", () => {
	it("runs business setup directly, not as a research session", () => {
		expect(isDirectKind("business-setup")).toBe(true);
		expect(DIRECT_KINDS).toContain("business-setup");
	});
});

describe("the neutral win-back defaults", () => {
	it("name no pallet trade", () => {
		const { business, titleKeywords } = DEFAULT_WIN_BACK_RULES;
		const text = JSON.stringify([
			business.description,
			business.products,
			business.sideProducts,
			business.boxProducts,
			business.unit,
			titleKeywords,
		]).toLowerCase();
		for (const word of ["palette", "pallet", "epal", "gitterbox", "lkw"]) {
			expect(text).not.toContain(word);
		}
		expect(DEFAULT_WIN_BACK_RULES.business.products).toEqual([]);
		expect(DEFAULT_WIN_BACK_RULES.business.minPallets).toBe(0);
	});
});
