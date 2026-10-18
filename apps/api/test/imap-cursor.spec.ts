import { describe, expect, it } from "bun:test";
import {
	backlogOf,
	parseImapCursor,
	serialiseImapCursor,
} from "../src/imap/imap-cursor";

describe("imap cursor", () => {
	it("starts empty for a missing or broken cursor", () => {
		expect(parseImapCursor(null)).toEqual({ v: 1, folders: {} });
		expect(parseImapCursor("not json")).toEqual({ v: 1, folders: {} });
		expect(parseImapCursor('{"v":2}')).toEqual({ v: 1, folders: {} });
	});

	it("round-trips and counts the backlog", () => {
		const cursor = {
			v: 1 as const,
			folders: {
				INBOX: {
					uidValidity: "1",
					lastUid: 500,
					backfillUid: 400,
					floorUid: 1,
				},
				Sent: { uidValidity: "1", lastUid: 20, backfillUid: null, floorUid: 1 },
				Old: { uidValidity: "1", lastUid: 90, backfillUid: 90, floorUid: 81 },
			},
		};

		expect(parseImapCursor(serialiseImapCursor(cursor))).toEqual(cursor);
		expect(backlogOf(cursor)).toBe(400 + 10);
	});
});
