import { describe, expect, it } from "bun:test";
import { rootMessageId } from "../src/google/gmail-mime";
import { parseImapMessage } from "../src/imap/imap-message";
import { normaliseMessageId } from "../src/mailbox/message-text";
import { outreachReply } from "../src/mailbox/reply-adoption";
import type { IncomingMessage } from "../src/mailbox/thread-writer.service";

const origin = { accountId: "acc-1", folder: "INBOX", uidValidity: "42" };

const own = {
	ourAddresses: new Set(["sales@own.example"]),
	ourDomains: new Set(["own.example"]),
};

function source(headers: string[], body: string): Buffer {
	return Buffer.from(
		[
			...headers,
			"Date: Mon, 04 May 2026 08:30:00 +0000",
			"Content-Type: text/plain; charset=utf-8",
			"",
			body,
		].join("\r\n"),
	);
}

async function parsed(headers: string[], body: string) {
	const message = await parseImapMessage(
		{ uid: 7, source: source(headers, body), internalDate: null },
		origin,
	);
	if (!message) throw new Error("The message did not parse");
	return message;
}

function verdict(message: IncomingMessage) {
	return outreachReply(
		{
			rootMessageId: message.rootId,
			messages: [
				{
					rfcMessageId: message.rfcMessageId,
					direction: "INBOUND" as const,
					fromEmail: message.from.email,
					subject: message.subject,
					body: message.body,
					snippet: null,
					recipients: message.recipients.map((person) => person.email),
				},
			],
		},
		own,
	);
}

describe("the reply rule on mail as the sync parses it", () => {
	it("accepts an IMAP reply that refers to a mail we never stored", async () => {
		const message = await parsed(
			[
				"Message-ID: <Reply-9@Customer.Example>",
				"In-Reply-To: <Campaign-1@Sender.Example>",
				"References: <Campaign-1@Sender.Example>",
				"From: Anna Schmidt <anna.schmidt@customer.example>",
				"To: TT <sales@own.example>",
				"Subject: AW: =?utf-8?Q?=C3=9Cbersch=C3=BCssige?= Europaletten fair abgeben",
			],
			"Wir haben 40 Paletten abzugeben.",
		);

		expect(message.rootId).not.toBe(message.rfcMessageId);
		expect(verdict(message).skip).toBeNull();
	});

	it("gives a first IMAP mail the same root and message id, whatever the case", async () => {
		const message = await parsed(
			[
				"Message-ID: <First-1@Vendor.Example>",
				"From: Vera <vera@vendor.example>",
				"To: sales@own.example",
				"Subject: Re: Ihre Rechnung",
			],
			"Bitte beachten Sie den Anhang.",
		);

		expect(message.rootId).toBe(message.rfcMessageId);
		expect(verdict(message).skip).toBe("no-reference");
	});

	it("gives a first Gmail mail the same root and message id", () => {
		const headers = [{ name: "Message-ID", value: "<First-2@Vendor.Example>" }];

		expect(rootMessageId(headers)).toBe(
			normaliseMessageId("<First-2@Vendor.Example>"),
		);
		expect(
			rootMessageId([
				...headers,
				{ name: "In-Reply-To", value: "<Campaign-2@Sender.Example>" },
			]),
		).toBe("campaign-2@sender.example");
	});

	it("refuses a reply that was written to a foreign address", async () => {
		const message = await parsed(
			[
				"Message-ID: <reply-3@customer.example>",
				"In-Reply-To: <campaign-3@sender.example>",
				"From: Anna Schmidt <anna.schmidt@customer.example>",
				"To: list@forum.example",
				"Subject: Re: Paletten",
			],
			"Gern.",
		);

		expect(verdict(message).skip).toBe("not-to-us");
	});

	it("refuses a thread that holds mail from an own address", async () => {
		const message = await parsed(
			[
				"Message-ID: <reply-4@own.example>",
				"In-Reply-To: <campaign-4@sender.example>",
				"From: Kollege <kollege@own.example>",
				"To: sales@own.example",
				"Subject: WG: Paletten",
			],
			"Zur Info.",
		);

		expect(verdict(message).skip).toBe("two-sided");
	});
});
