import { describe, expect, it } from "bun:test";
import { byDay } from "./timeline";
import { blockMessages, blockRecords, toBlocks } from "./timeline-blocks";

function email(id: string, thread: string, subject: string, at: string) {
	return {
		id,
		subject,
		occurredAt: at,
		createdAt: at,
		emailThread: { id: thread, lastMessage: { direction: "INBOUND" } },
	};
}

function note(id: string, at: string) {
	return {
		id,
		subject: null,
		occurredAt: at,
		createdAt: at,
		emailThread: null,
	};
}

describe("toBlocks", () => {
	it("joins consecutive entries of one thread", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer", "2026-09-14T09:00:00.000Z"),
			email("b", "t1", "Offer", "2026-09-14T08:00:00.000Z"),
		]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.kind).toBe("thread");
	});

	it("joins two threads that share a cleaned subject", () => {
		const blocks = toBlocks([
			email("a", "t1", "AW: Re: Offer", "2026-09-14T09:00:00.000Z"),
			email("b", "t2", "Offer", "2026-09-14T08:00:00.000Z"),
		]);
		expect(blocks).toHaveLength(1);
	});

	it("keeps threads apart when a note sits between them", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer", "2026-09-14T09:00:00.000Z"),
			note("n", "2026-09-14T08:30:00.000Z"),
			email("b", "t1", "Offer", "2026-09-14T08:00:00.000Z"),
		]);
		expect(blocks.map((block) => block.kind)).toEqual([
			"thread",
			"entry",
			"thread",
		]);
	});

	it("keeps threads with different subjects apart", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer", "2026-09-14T09:00:00.000Z"),
			email("b", "t2", "Invoice", "2026-09-14T08:00:00.000Z"),
		]);
		expect(blocks).toHaveLength(2);
	});

	it("leaves a thread without a last message as its own entry", () => {
		const blocks = toBlocks([
			{
				id: "a",
				subject: "Offer",
				occurredAt: "2026-09-14T09:00:00.000Z",
				createdAt: "2026-09-14T09:00:00.000Z",
				emailThread: { id: "t1", lastMessage: null },
			},
			email("b", "t2", "Offer", "2026-09-14T08:00:00.000Z"),
		]);
		expect(blocks.map((block) => block.kind)).toEqual(["entry", "thread"]);
	});
});

describe("a merged thread keeps the day of its newest message", () => {
	const entries = [
		email("a", "t1", "Antwort Europaletten", "2026-09-14T07:37:00.000Z"),
		email("b", "t2", "AW: Antwort Europaletten", "2026-09-12T15:58:00.000Z"),
		email("c", "t3", "Re: Antwort Europaletten", "2026-09-11T11:20:00.000Z"),
		email("d", "t4", "Rechnung Europaletten", "2026-09-10T17:45:00.000Z"),
	];

	it("takes the block date from the newest entry, not the oldest", () => {
		const blocks = toBlocks(entries);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]?.occurredAt).toBe("2026-09-14T07:37:00.000Z");
		expect(blocks[1]?.occurredAt).toBe("2026-09-10T17:45:00.000Z");
	});

	it("drops the day strips that held one message of the same thread", () => {
		expect(byDay(entries, false)).toHaveLength(4);
		expect(byDay(toBlocks(entries), false)).toHaveLength(2);
	});
});

describe("a merged block keeps every record its entries link to", () => {
	const deal = (id: string) => ({ id, name: `Deal ${id}` });
	const contact = (id: string) => ({ id, firstName: "Ada", lastName: null });

	it("shows the deal of a swallowed entry, not only the head deal", () => {
		const records = blockRecords(
			[
				{ deal: deal("d1"), contact: null },
				{ deal: deal("d2"), contact: null },
			],
			"company-1",
		);
		expect(records.deals.map((one) => one.id)).toEqual(["d1", "d2"]);
	});

	it("names one record once when two entries share it", () => {
		const records = blockRecords(
			[
				{ deal: deal("d1"), contact: contact("c1") },
				{ deal: deal("d1"), contact: contact("c1") },
			],
			"company-1",
		);
		expect(records.deals).toHaveLength(1);
		expect(records.contacts).toHaveLength(1);
	});

	it("leaves out the record the sheet already shows", () => {
		const records = blockRecords(
			[{ deal: deal("d1"), contact: contact("c1") }],
			"d1",
		);
		expect(records.deals).toHaveLength(0);
		expect(records.contacts.map((one) => one.id)).toEqual(["c1"]);
	});
});

describe("a merged panel reads from oldest to newest across the block", () => {
	const message = (id: string, sentAt: string) => ({ id, sentAt });

	it("interleaves two threads whose dates overlap", () => {
		const merged = blockMessages([
			[
				message("a1", "2026-08-10T09:00:00.000Z"),
				message("a2", "2026-09-14T09:00:00.000Z"),
			],
			[
				message("b1", "2026-09-01T09:00:00.000Z"),
				message("b2", "2026-09-20T09:00:00.000Z"),
			],
		]);
		expect(merged.map((one) => one.id)).toEqual(["a1", "b1", "a2", "b2"]);
	});

	it("shows a message once when one thread is loaded twice", () => {
		const merged = blockMessages([
			[message("a1", "2026-08-10T09:00:00.000Z")],
			[message("a1", "2026-08-10T09:00:00.000Z")],
		]);
		expect(merged).toHaveLength(1);
	});
});
