import { describe, expect, it } from "bun:test";
import type { MatchContext } from "../src/mailbox/mailbox-match.service";
import {
	isLinkable,
	planParticipants,
} from "../src/mailbox/thread-participants";

const context: MatchContext = {
	ourAddresses: new Set(["rep@own.example"]),
	ourDomains: new Set(["own.example"]),
	suppressedDomains: new Set(["blocked.example"]),
	suppressedEmails: new Set(["gone@kunde.example"]),
};

const at = (hour: number) => new Date(Date.UTC(2026, 8, 1, hour));

function message(
	direction: "INBOUND" | "OUTBOUND",
	fromEmail: string,
	sentAt: Date,
	recipients: string[] = [],
	text: { subject?: string | null; body?: string } = {},
) {
	return {
		direction,
		fromEmail,
		subject: text.subject === undefined ? "Re: Angebot" : text.subject,
		body: text.body ?? "Wir brauchen zwei Paletten.",
		snippet: null,
		sentAt,
		recipients,
	};
}

describe("isLinkable", () => {
	it("refuses our own addresses and domains, suppressed, machine and role addresses", () => {
		expect(isLinkable("rep@own.example", context)).toBe(false);
		expect(isLinkable("colleague@own.example", context)).toBe(false);
		expect(isLinkable("gone@kunde.example", context)).toBe(false);
		expect(isLinkable("anna@blocked.example", context)).toBe(false);
		expect(isLinkable("info@kunde.example", context)).toBe(false);
		expect(isLinkable("noreply@kunde.example", context)).toBe(false);
		expect(isLinkable("not-an-address", context)).toBe(false);
	});

	it("accepts a person at a company and a person on a free-mail domain", () => {
		expect(isLinkable("Anna@Kunde.example", context)).toBe(true);
		expect(isLinkable("anna@gmail.com", context)).toBe(true);
	});
});

describe("planParticipants", () => {
	it("links inbound senders and outbound recipients with their first and last mail", () => {
		const plan = planParticipants(
			[
				message("OUTBOUND", "rep@own.example", at(8), [
					"anna@kunde.example",
					"bert@kunde.example",
					"info@kunde.example",
				]),
				message("INBOUND", "anna@kunde.example", at(10)),
				message("INBOUND", "Anna@kunde.example", at(12)),
			],
			"Angebot",
			context,
		);

		expect(plan).toEqual([
			{
				email: "anna@kunde.example",
				role: "SENDER",
				firstAt: at(8),
				lastAt: at(12),
			},
			{
				email: "bert@kunde.example",
				role: "RECIPIENT",
				firstAt: at(8),
				lastAt: at(8),
			},
		]);
	});

	it("never counts an automatic reply and never links our own people", () => {
		const plan = planParticipants(
			[
				message("INBOUND", "carl@kunde.example", at(9), [], {
					subject: null,
					body: "",
				}),
				message("INBOUND", "dora@kunde.example", at(10), [], {
					body: "Ich bin bis zum 20.09. nicht im Büro.",
				}),
				message("INBOUND", "colleague@own.example", at(11)),
			],
			"Automatische Antwort: Angebot",
			context,
		);

		expect(plan.map((person) => person.email)).toEqual([]);
	});

	it("keeps a sender who also received mail as a sender", () => {
		const plan = planParticipants(
			[
				message("INBOUND", "carl@kunde.example", at(9)),
				message("OUTBOUND", "rep@own.example", at(11), ["carl@kunde.example"]),
			],
			"Re: Angebot",
			context,
		);

		expect(plan).toEqual([
			{
				email: "carl@kunde.example",
				role: "SENDER",
				firstAt: at(9),
				lastAt: at(11),
			},
		]);
	});
});
