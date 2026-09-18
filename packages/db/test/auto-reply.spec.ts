import { describe, expect, it } from "bun:test";
import { DIRECT_KINDS, isDirectKind } from "../src/agent-tasks";
import {
	isAutoReply,
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
