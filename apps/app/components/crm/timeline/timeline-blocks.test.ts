import { describe, expect, it } from "bun:test";
import { byDay } from "./timeline";
import { toBlocks } from "./timeline-blocks";

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
