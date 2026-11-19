import { describe, expect, it } from "bun:test";
import {
	CONVERSATION_ROOT_PREFIX,
	isReplySubject,
	replyToMissingMail,
	type StoredMail,
} from "../src/message-text";

const OUTREACH = "<campaign-1@sender.example>";

function mail(overrides: Partial<StoredMail> = {}): StoredMail {
	return {
		rfcMessageId: "<reply-1@customer.example>",
		direction: "INBOUND",
		fromEmail: "anna.schmidt@customer.example",
		subject: "AW: Überschüssige Europaletten fair abgeben",
		body: "Guten Tag, wir haben 40 Paletten abzugeben. Bitte rufen Sie mich an.",
		snippet: null,
		...overrides,
	};
}

describe("replyToMissingMail", () => {
	it("finds a human reply whose first mail is not stored", () => {
		const reply = mail();
		const found = replyToMissingMail({
			rootMessageId: OUTREACH,
			messages: [reply],
		});

		expect(found).toEqual({ reply, skip: null });
	});

	it("reads the reply prefix in several languages", () => {
		for (const subject of [
			"Re: Sell surplus Euro pallets at fair prices",
			"RE: Sell surplus Euro pallets at fair prices",
			"WG: Ankauf gebrauchter Europaletten",
			"Antw: Ankauf gebrauchter Europaletten",
			"SV: Sell surplus Euro pallets",
			"Odp: Sell surplus Euro pallets",
			"YNT: Sell surplus Euro pallets",
			"R: Sell surplus Euro pallets",
		]) {
			const expected = subject !== "R: Sell surplus Euro pallets";
			expect(isReplySubject(subject)).toBe(expected);
		}
	});

	it("refuses an automatic reply", () => {
		const found = replyToMissingMail({
			rootMessageId: OUTREACH,
			messages: [
				mail({
					subject: "Automatische Antwort: Überschüssige Europaletten",
					body: "Ich bin bis zum 3. Mai nicht im Büro.",
				}),
			],
		});

		expect(found).toEqual({ reply: null, skip: "no-real-answer" });
	});

	it("refuses an out of office note that keeps the reply prefix", () => {
		const found = replyToMissingMail({
			rootMessageId: OUTREACH,
			messages: [
				mail({
					body: "Vielen Dank. Ich bin derzeit im Urlaub und abwesend. In dringenden Fällen wenden Sie sich an die Zentrale.",
				}),
			],
		});

		expect(found.skip).toBe("no-real-answer");
	});

	it("refuses a bounce", () => {
		for (const bounce of [
			mail({
				fromEmail: "mailer-daemon@customer.example",
				subject: "Undeliverable: Überschüssige Europaletten fair abgeben",
				body: "Delivery has failed to these recipients.",
			}),
			mail({
				fromEmail: "postmaster@customer.example",
				subject: "AW: Überschüssige Europaletten fair abgeben",
				body: "Ihre Nachricht konnte nicht zugestellt werden.",
			}),
			mail({
				subject: "Re: Sell surplus Euro pallets",
				body: "Your message to bob@customer.example couldn't be delivered.",
			}),
		]) {
			const found = replyToMissingMail({
				rootMessageId: OUTREACH,
				messages: [bounce],
			});

			expect(found.skip).toBe("no-real-answer");
		}
	});

	it("refuses a newsletter, which carries no reply subject", () => {
		const found = replyToMissingMail({
			rootMessageId: "<news-1@customer.example>",
			messages: [
				mail({
					rfcMessageId: "<news-1@customer.example>",
					subject: "Unsere Angebote im Mai",
				}),
			],
		});

		expect(found.skip).toBe("no-reply-subject");
	});

	it("refuses a mail that only pretends to be a reply and refers to nothing", () => {
		const found = replyToMissingMail({
			rootMessageId: "<spam-1@customer.example>",
			messages: [
				mail({
					rfcMessageId: "<spam-1@customer.example>",
					subject: "Re: Ihre Rechnung",
				}),
			],
		});

		expect(found.skip).toBe("no-reference");
	});

	it("accepts the reply subject alone when the provider gives no reference headers", () => {
		const found = replyToMissingMail({
			rootMessageId: `${CONVERSATION_ROOT_PREFIX}AAQkAD`,
			messages: [mail()],
		});

		expect(found.skip).toBeNull();
	});

	it("leaves a conversation alone that already holds our mail", () => {
		const found = replyToMissingMail({
			rootMessageId: OUTREACH,
			messages: [
				mail({
					rfcMessageId: OUTREACH,
					direction: "OUTBOUND",
					fromEmail: "sales@own.example",
					subject: "Überschüssige Europaletten fair abgeben",
				}),
				mail(),
			],
		});

		expect(found.skip).toBe("two-sided");
	});

	it("takes the real reply when an automatic reply came first", () => {
		const reply = mail({ rfcMessageId: "<reply-2@customer.example>" });
		const found = replyToMissingMail({
			rootMessageId: OUTREACH,
			messages: [
				mail({
					subject: "Automatische Antwort: Überschüssige Europaletten",
					body: "Ich bin bis zum 3. Mai nicht im Büro.",
				}),
				reply,
			],
		});

		expect(found.reply).toBe(reply);
	});
});
