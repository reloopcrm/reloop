import { describe, expect, it } from "bun:test";
import { parseImapMessage } from "../src/imap/imap-message";

const origin = { accountId: "acc-1", folder: "INBOX", uidValidity: "42" };

function raw(source: string, uid = 7) {
	return { uid, source: Buffer.from(source), internalDate: null };
}

describe("parseImapMessage", () => {
	it("reads a plain text message with threading headers", async () => {
		const parsed = await parseImapMessage(
			raw(
				[
					"Message-ID: <reply-2@example.com>",
					"In-Reply-To: <root-1@example.com>",
					"References: <root-1@example.com>",
					"From: Ada Okafor <ada@acme.com>",
					"To: Rep <rep@reloop.de>, ops@acme.com",
					"Cc: Cc Person <cc@acme.com>",
					"Subject: Re: Pricing",
					"Date: Mon, 01 Sep 2025 10:00:00 +0000",
					"Content-Type: text/plain; charset=utf-8",
					"",
					"Sounds good.",
					"",
					"On Sun, Aug 31, 2025 Rep wrote:",
					"> old quoted text",
				].join("\r\n"),
			),
			origin,
		);

		expect(parsed).not.toBeNull();
		expect(parsed?.rfcMessageId).toBe("reply-2@example.com");
		expect(parsed?.rootId).toBe("root-1@example.com");
		expect(parsed?.from).toEqual({ email: "ada@acme.com", name: "Ada Okafor" });
		expect(parsed?.recipients).toEqual([
			{ email: "rep@reloop.de", name: "Rep", kind: "to" },
			{ email: "ops@acme.com", name: null, kind: "to" },
			{ email: "cc@acme.com", name: "Cc Person", kind: "cc" },
		]);
		expect(parsed?.subject).toBe("Re: Pricing");
		expect(parsed?.body).toBe("Sounds good.");
		expect(parsed?.sentAt.toISOString()).toBe("2025-09-01T10:00:00.000Z");
		expect(parsed?.imapAccountId).toBe("acc-1");
	});

	it("falls back to stripped html and a synthetic message id", async () => {
		const parsed = await parseImapMessage(
			{
				uid: 9,
				internalDate: new Date("2025-09-02T08:00:00.000Z"),
				source: Buffer.from(
					[
						"From: bob@acme.com",
						"To: rep@reloop.de",
						"Subject: Hello",
						"Content-Type: text/html; charset=utf-8",
						"",
						"<p>Hi <b>there</b></p><p>Second line</p>",
					].join("\r\n"),
				),
			},
			{ ...origin, folder: "[Gmail]/All Mail" },
		);

		expect(parsed?.rfcMessageId).toBe(
			"imap-acc-1-gmail-all-mail-42-9@local.invalid",
		);
		expect(parsed?.rootId).toBe(parsed?.rfcMessageId);
		expect(parsed?.body).toBe("Hi there\n\nSecond line");
		expect(parsed?.sentAt.toISOString()).toBe("2025-09-02T08:00:00.000Z");
	});

	it("drops a message without a sender", async () => {
		const parsed = await parseImapMessage(
			raw(["Subject: nobody", "", "body"].join("\r\n")),
			origin,
		);

		expect(parsed).toBeNull();
	});
});
