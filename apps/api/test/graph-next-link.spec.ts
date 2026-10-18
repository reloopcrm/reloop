import { describe, expect, it } from "bun:test";
import type { MailboxApiClient } from "../src/mailbox/mailbox-api.client";
import { GraphClient } from "../src/microsoft/graph.client";

function client() {
	const called: string[] = [];
	const api = {
		get: async (url: string) => {
			called.push(url);
			return { outcome: "ok", data: {} };
		},
	} as unknown as MailboxApiClient;

	return { graph: new GraphClient(api), called };
}

const FOREIGN = [
	"https://evil.example/v1.0/me/messages?$skiptoken=1",
	"http://graph.microsoft.com/v1.0/me/messages",
	"https://graph.microsoft.com.evil.example/v1.0/me/messages",
	"//evil.example/v1.0/me/messages",
	"not a url at all",
];

describe("the Outlook page cursor", () => {
	it("follows a link Microsoft Graph itself served", async () => {
		const { graph, called } = client();
		const link = "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=2";

		const result = await graph.nextPage("mailbox-token", link);

		expect(result.outcome).toBe("ok");
		expect(called).toEqual([link]);
	});

	for (const link of FOREIGN) {
		it(`sends the mailbox token nowhere for ${link}`, async () => {
			const { graph, called } = client();

			const result = await graph.nextPage("mailbox-token", link);

			expect(result.outcome).toBe("cursor-invalid");
			expect(called).toEqual([]);
		});
	}
});
