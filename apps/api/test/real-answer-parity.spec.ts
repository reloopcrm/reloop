import { describe, expect, it } from "bun:test";
import { db, Prisma } from "@crm/db";
import { type AnswerCandidate, isRealAnswer } from "@crm/db/message-text";
import { realAnswer, realAnswerRule } from "@crm/db/real-answer";

const person = "anna@example.com";

const samples = {
	realReply: inbound({ body: "Yes, we have 500 pallets. What do you pay?" }),
	noSubjectNoBody: inbound({ subject: null, body: null }),
	snippetOnly: inbound({ body: null, snippet: "Sounds good, call me." }),
	outbound: {
		...inbound({ body: "Shall we talk?" }),
		direction: "OUTBOUND",
	},
	outOfOfficeSubject: inbound({
		subject: "AW: Automatische Antwort: Paletten",
	}),
	outOfOfficeBody: inbound({
		body: "Thanks for your email. I am currently out of the office until Monday.",
	}),
	germanVacationBody: inbound({
		body: "Guten Tag, ich bin bis zum 20.09. nicht im Büro und lese keine Mails.",
	}),
	vacationAcrossLines: inbound({
		body: "Guten Tag, ich bin bis zum 20.09.\nnicht im Büro.",
	}),
	snippetAutoReply: inbound({
		body: null,
		snippet: "This is an automated reply. I will be back on Monday.",
	}),
	autoReplyPastTheLimit: inbound({
		body: `${"Thanks for the offer. ".repeat(40)}I am currently out of the office.`,
	}),
	autoReplyAfterEmoji: inbound({
		body: `${"😀".repeat(50)}${"a".repeat(700)} I am away.`,
	}),
	autoReplyAfterEmojiInsideTheLimit: inbound({
		body: `${"😀".repeat(50)}${"a".repeat(600)} I am away.`,
	}),
	bounceAfterEmoji: inbound({
		body: `${"😀".repeat(100)}${"a".repeat(630)} This is the mail system at host mail.example.com.`,
	}),
	autoReplyWithNoBreakSpace: inbound({ body: "I\u00a0am away until Monday." }),
	autoReplyWithEmSpace: inbound({ body: "I\u2003am away until Monday." }),
	autoReplyWithZeroWidthNoBreakSpace: inbound({
		body: "I\ufeffam away until Monday.",
	}),
	nextLineIsNotWhitespace: inbound({ body: "I\u0085am away until Monday." }),
	autoReplyWithLineSeparator: inbound({ body: "I\u2028am away until Monday." }),
	mailerDaemon: inbound({
		fromEmail: "MAILER-DAEMON@example.com",
		subject: "Re: Pallets",
	}),
	postmaster: inbound({ fromEmail: "postmaster@example.com" }),
	exchange: inbound({
		fromEmail: "MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@example.com",
	}),
	deliveryStatus: inbound({
		subject: "Delivery Status Notification (Failure)",
	}),
	undeliverable: inbound({ subject: "Undeliverable: Pallets" }),
	mailDeliveryFailed: inbound({
		subject: "Mail delivery failed: returning message to sender",
	}),
	returnedToSender: inbound({
		subject: "Undelivered Mail Returned to Sender",
	}),
	failureNotice: inbound({ subject: "failure notice" }),
	gmailBounceBody: inbound({
		body: "Address not found\n\nYour message wasn't delivered to anna@example.com because the address couldn't be found.",
	}),
	outlookBounceBody: inbound({
		body: "Your message to anna@example.com couldn't be delivered.",
	}),
	exchangeBounceBody: inbound({
		body: "Delivery has failed to these recipients or groups:",
	}),
	postfixBounceBody: inbound({
		body: "This is the mail system at host mail.example.com.",
	}),
	germanBounceBody: inbound({
		body: "Ihre Nachricht konnte an folgende Empfänger nicht zugestellt werden.",
	}),
	deliveryOfGoods: inbound({
		subject: "Re: Delivery failed yesterday",
		body: "The truck did not arrive. Can you send the pallets again?",
	}),
	replyQuotingAutoReply: inbound({
		body: "Yes, we have 500 pallets.\n\n> I am currently out of the office until Monday.",
	}),
	replyBelowEnglishHeader: inbound({
		body: "Yes, we have 500 pallets.\n\nOn Tue, 3 Feb 2026, Anna wrote:\nI am currently out of the office.",
	}),
	replyBelowGermanHeader: inbound({
		body: "Ja, passt.\n\nvon: Anna\nIch bin derzeit nicht im Büro.",
	}),
	replyQuotingBounce: inbound({
		body: "Sorry, wrong address before.\n-----Original Message-----\nYour message to anna@example.com couldn't be delivered.",
	}),
	autoReplyStartingWithHeader: inbound({
		body: "From: Anna\nI am currently out of the office.",
	}),
	senderNamedPostmasterInside: inbound({
		fromEmail: "anna.postmaster@example.com",
	}),
} satisfies Record<string, AnswerCandidate>;

function inbound(overrides: Partial<AnswerCandidate>): AnswerCandidate {
	return {
		direction: "INBOUND",
		fromEmail: person,
		subject: "Re: Pallets",
		body: "Hello",
		snippet: null,
		...overrides,
	};
}

async function sqlVerdicts(
	verdict: Prisma.Sql,
	flag: (message: AnswerCandidate) => boolean | null = () => null,
): Promise<Map<string, boolean>> {
	const rows = Object.entries(samples).map(
		([name, message]) =>
			Prisma.sql`(${name}, ${message.direction}, ${message.fromEmail}, ${message.subject}::text, ${message.body}::text, ${message.snippet}::text, ${flag(message)}::boolean)`,
	);

	const result = await db.$queryRaw<{ name: string; real: boolean }[]>`
		SELECT m.name, ${verdict} AS real
		FROM (VALUES ${Prisma.join(rows)})
			AS m(name, "direction", "fromEmail", "subject", "body", "snippet", "realAnswer")
	`;

	return new Map(result.map((row) => [row.name, row.real]));
}

function expectTypeScriptVerdicts(sql: Map<string, boolean>): void {
	for (const [name, message] of Object.entries(samples)) {
		expect({ name, real: sql.get(name) }).toEqual({
			name,
			real: isRealAnswer(message),
		});
	}
}

describe("the real answer rule", () => {
	it("gives the same verdict in SQL as in TypeScript", async () => {
		expectTypeScriptVerdicts(await sqlVerdicts(realAnswerRule("m")));
	});

	it("falls back to the rule while the stored flag is empty", async () => {
		expectTypeScriptVerdicts(await sqlVerdicts(realAnswer("m")));
	});

	it("reads the stored flag once it is written", async () => {
		expectTypeScriptVerdicts(await sqlVerdicts(realAnswer("m"), isRealAnswer));
	});

	it("trusts the stored flag over the rule, but never for mail we sent", async () => {
		const flipped = await sqlVerdicts(
			realAnswer("m"),
			(message) => !isRealAnswer(message),
		);

		expect(flipped.get("realReply")).toBe(false);
		expect(flipped.get("outOfOfficeBody")).toBe(true);
		expect(flipped.get("outbound")).toBe(false);
	});

	it("counts only a person writing back", () => {
		const real = Object.entries(samples)
			.filter(([, message]) => isRealAnswer(message))
			.map(([name]) => name)
			.sort();

		expect(real).toEqual(
			[
				"autoReplyPastTheLimit",
				"deliveryOfGoods",
				"nextLineIsNotWhitespace",
				"noSubjectNoBody",
				"realReply",
				"replyBelowEnglishHeader",
				"replyBelowGermanHeader",
				"replyQuotingAutoReply",
				"replyQuotingBounce",
				"senderNamedPostmasterInside",
				"snippetOnly",
				"vacationAcrossLines",
			].sort(),
		);
	});

	it("refuses an alias that is not a plain name", () => {
		expect(() => realAnswer("m; DROP TABLE contact")).toThrow();
		expect(() => realAnswerRule("m; DROP TABLE contact")).toThrow();
	});
});
