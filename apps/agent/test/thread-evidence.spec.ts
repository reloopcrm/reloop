import { describe, expect, it } from "bun:test";
import { quotedMessages } from "../agent/lib/insight";

function thread(ids: string[]) {
	return {
		id: "t1",
		subject: "Europaletten",
		contactId: "c1",
		lastMessageAt: new Date("2026-09-14T09:00:00.000Z"),
		messages: ids.map((id, index) => ({
			id,
			direction: index % 2 === 0 ? "INBOUND" : "OUTBOUND",
			fromEmail: "them@example.com",
			fromName: null,
			sentAt: new Date(`2026-09-1${index}T09:00:00.000Z`),
			body: "text",
			snippet: null,
		})),
	};
}

describe("the agent writes the message id beside each evidence quote", () => {
	it("turns the transcript number into the id of that message", () => {
		expect(
			quotedMessages(thread(["m1", "m2", "m3"]), [
				{ quote: "We need 620 pallets.", message: 2 },
			]),
		).toEqual({
			evidence: ["We need 620 pallets."],
			evidenceMessageIds: ["m2"],
		});
	});

	it("keeps the quote when the number names no message", () => {
		expect(
			quotedMessages(thread(["m1"]), [{ quote: "Price is fine.", message: 9 }]),
		).toEqual({ evidence: ["Price is fine."], evidenceMessageIds: [""] });
	});
});
