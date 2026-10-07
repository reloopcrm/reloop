import { afterEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	gmailHistoryList,
	gmailMessage,
	gmailMessageList,
} from "../src/google/gmail.client";
import { MailboxApiClient } from "../src/mailbox/mailbox-api.client";
import { graphMessagePage } from "../src/microsoft/graph.client";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stub(
	status: number,
	body: z.core.util.JSONType,
	headers: Record<string, string> = {},
): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json", ...headers },
		})) as unknown as typeof fetch;
}

const client = new MailboxApiClient();
const okBody = z.object({ ok: z.boolean() });
const call = () => client.get("https://example.test/x", "token", okBody);

describe("MailboxApiClient", () => {
	it("returns the payload on success", async () => {
		stub(200, { ok: true });
		expect(await call()).toEqual({ outcome: "ok", data: { ok: true } });
	});

	it("maps Gmail's 404 to cursor-invalid", async () => {
		stub(404, { error: { message: "Requested entity was not found." } });
		const result = await call();
		expect(result.outcome).toBe("cursor-invalid");
	});

	it("maps Calendar's 410 to cursor-invalid", async () => {
		stub(410, { error: { message: "Sync token is no longer valid." } });
		const result = await call();
		expect(result.outcome).toBe("cursor-invalid");
	});

	it("maps 401 to unauthorized, so the row can be marked for reconnect", async () => {
		stub(401, { error: { message: "Invalid Credentials" } });
		expect((await call()).outcome).toBe("unauthorized");
	});

	it("treats a quota 403 as rate limiting, not a hard failure", async () => {
		stub(403, { error: { message: "User Rate Limit Exceeded" } });
		const result = await call();

		expect(result.outcome).toBe("rate-limited");
		if (result.outcome === "rate-limited") {
			expect(result.retryAfterMs).toBeGreaterThan(0);
		}
	});

	it("treats a permission 403 as terminal", async () => {
		stub(403, { error: { message: "Insufficient Permission" } });
		const result = await call();

		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") expect(result.retryable).toBe(false);
	});

	it("honours Retry-After on a 429", async () => {
		stub(
			429,
			{ error: { message: "Too many requests" } },
			{ "retry-after": "600" },
		);
		const result = await call();

		expect(result.outcome).toBe("rate-limited");
		if (result.outcome === "rate-limited") {
			expect(result.retryAfterMs).toBe(600_000);
		}
	});

	it("marks 5xx retryable and 4xx not", async () => {
		stub(503, { error: { message: "Backend error" } });
		const server = await call();
		expect(server.outcome === "failed" && server.retryable).toBe(true);

		stub(400, { error: { message: "Bad request" } });
		const client400 = await call();
		expect(client400.outcome === "failed" && client400.retryable).toBe(false);
	});

	it("parses a Gmail history page into its domain type", async () => {
		stub(200, {
			history: [
				{
					id: "901",
					messages: [{ id: "m1", threadId: "t1" }],
					messagesAdded: [{ message: { id: "m1", threadId: "t1" } }],
					labelsRemoved: [
						{ message: { id: "m2", threadId: "t2" }, labelIds: ["TRASH"] },
					],
				},
			],
			historyId: "905",
		});

		const result = await client.get(
			"https://example.test/history",
			"token",
			gmailHistoryList,
		);

		expect(result).toEqual({
			outcome: "ok",
			data: {
				history: [
					{
						id: "901",
						messagesAdded: [{ message: { id: "m1", threadId: "t1" } }],
						labelsRemoved: [
							{ message: { id: "m2", threadId: "t2" }, labelIds: ["TRASH"] },
						],
					},
				],
				historyId: "905",
			},
		});
	});

	it("parses a Gmail message list and a full message with nested parts", async () => {
		stub(200, {
			messages: [{ id: "m1", threadId: "t1" }],
			nextPageToken: "next",
			resultSizeEstimate: 1,
		});
		const list = await client.get(
			"https://example.test/messages",
			"token",
			gmailMessageList,
		);
		expect(list.outcome === "ok" && list.data.messages?.[0]?.id).toBe("m1");

		stub(200, {
			id: "m1",
			threadId: "t1",
			labelIds: ["INBOX"],
			internalDate: "1767225600000",
			historyId: "905",
			sizeEstimate: 2048,
			payload: {
				mimeType: "multipart/alternative",
				headers: [{ name: "From", value: "preview@example.com" }],
				body: { size: 0 },
				parts: [
					{
						mimeType: "text/plain",
						body: { data: "SGVsbG8", size: 5 },
					},
				],
			},
		});
		const message = await client.get(
			"https://example.test/messages/m1",
			"token",
			gmailMessage,
		);
		expect(message.outcome).toBe("ok");
		if (message.outcome === "ok") {
			expect(message.data.payload?.parts?.[0]?.body?.data).toBe("SGVsbG8");
		}
	});

	it("parses a Graph message page and reads a null field as absent", async () => {
		stub(200, {
			"@odata.context": "https://graph.microsoft.com/v1.0/$metadata#messages",
			value: [
				{
					id: "g1",
					internetMessageId: "<one@example.com>",
					conversationId: "c1",
					subject: null,
					from: {
						emailAddress: { name: "Preview", address: "preview@example.com" },
					},
					sender: null,
					toRecipients: [],
					ccRecipients: [],
					receivedDateTime: "2026-01-01T00:00:00Z",
					sentDateTime: "2026-01-01T00:00:00Z",
					body: { contentType: "html", content: "<p>Hi</p>" },
					bodyPreview: "Hi",
					internetMessageHeaders: null,
					parentFolderId: "inbox",
					webLink: "https://outlook.example.com/g1",
				},
			],
			"@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=1",
		});

		const result = await client.get(
			"https://example.test/messages",
			"token",
			graphMessagePage,
		);

		expect(result.outcome).toBe("ok");
		if (result.outcome === "ok") {
			const [message] = result.data.value ?? [];
			expect(message?.subject).toBeNull();
			expect(message?.sender).toBeUndefined();
			expect(message?.internetMessageHeaders).toBeUndefined();
			expect(message?.from?.emailAddress?.address).toBe("preview@example.com");
			expect(result.data["@odata.nextLink"]).toContain("$skip=1");
		}
	});

	it("fails a Gmail list whose messages are not a list, naming the field", async () => {
		stub(200, { messages: "nope" });
		const result = await client.get(
			"https://example.test/messages",
			"token",
			gmailMessageList,
		);

		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") {
			expect(result.retryable).toBe(false);
			expect(result.reason).toContain("messages");
		}
	});

	it("fails a Graph page whose message id is a number", async () => {
		stub(200, { value: [{ id: 7 }] });
		const result = await client.get(
			"https://example.test/messages",
			"token",
			graphMessagePage,
		);

		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") {
			expect(result.reason).toContain("value.0.id");
		}
	});

	it("reads a Gmail error with a numeric code as rate limiting", async () => {
		stub(403, {
			error: {
				code: 403,
				message: "User Rate Limit Exceeded",
				status: "PERMISSION_DENIED",
				errors: [{ reason: "userRateLimitExceeded" }],
			},
		});
		expect((await call()).outcome).toBe("rate-limited");
	});

	it("reads a Graph error code when the error has no message", async () => {
		stub(400, { error: { code: "ErrorInvalidIdMalformed" } });
		const result = await call();
		expect(result.outcome === "failed" && result.reason).toBe(
			"ErrorInvalidIdMalformed",
		);
	});

	it("falls back to the HTTP status when the error body has no error", async () => {
		stub(500, {});
		const empty = await call();
		expect(empty.outcome === "failed" && empty.reason).toBe("HTTP 500");

		stub(400, { error: "invalid_request" });
		const flat = await call();
		expect(flat.outcome === "failed" && flat.reason).toBe("HTTP 400");
	});

	it("fails a success body that does not match the schema, instead of handing it on", async () => {
		stub(200, { messages: [] });
		const result = await client.get(
			"https://example.test/history",
			"token",
			z.object({ historyId: z.string() }),
		);

		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") {
			expect(result.retryable).toBe(false);
			expect(result.reason).toContain("historyId");
		}
	});

	it("surfaces a network error as retryable rather than throwing", async () => {
		globalThis.fetch = (async () => {
			throw new Error("connect ECONNREFUSED");
		}) as unknown as typeof fetch;

		const result = await call();
		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") expect(result.retryable).toBe(true);
	});
});
