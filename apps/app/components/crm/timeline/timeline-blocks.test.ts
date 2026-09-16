import { describe, expect, it } from "bun:test";
import { toBlocks } from "./timeline-blocks";

function email(id: string, thread: string, subject: string) {
	return { id, subject, emailThread: { id: thread } };
}

function note(id: string) {
	return { id, subject: null, emailThread: null };
}

describe("toBlocks", () => {
	it("joins consecutive entries of one thread", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer"),
			email("b", "t1", "Offer"),
		]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.kind).toBe("thread");
	});

	it("joins two threads that share a cleaned subject", () => {
		const blocks = toBlocks([
			email("a", "t1", "AW: Re: Offer"),
			email("b", "t2", "Offer"),
		]);
		expect(blocks).toHaveLength(1);
	});

	it("keeps threads apart when a note sits between them", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer"),
			note("n"),
			email("b", "t1", "Offer"),
		]);
		expect(blocks.map((block) => block.kind)).toEqual([
			"thread",
			"entry",
			"thread",
		]);
	});

	it("keeps threads with different subjects apart", () => {
		const blocks = toBlocks([
			email("a", "t1", "Offer"),
			email("b", "t2", "Invoice"),
		]);
		expect(blocks).toHaveLength(2);
	});
});
