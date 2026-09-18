import { describe, expect, it } from "bun:test";
import { dueOnDayOf } from "../src/activities/due-date";

const ZONES = [
	"Pacific/Midway",
	"America/Anchorage",
	"America/Los_Angeles",
	"America/New_York",
	"America/Sao_Paulo",
	"UTC",
	"Europe/Berlin",
	"Africa/Nairobi",
	"Asia/Kolkata",
	"Asia/Tokyo",
	"Australia/Sydney",
];

function localDay(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

describe("a task written by the API", () => {
	it("falls on the intended calendar day in every zone a rep works in", () => {
		const intended = "2026-09-18";
		const dueAt = dueOnDayOf(new Date("2026-09-18T06:30:00.000Z"));

		for (const zone of ZONES) {
			expect(`${zone} ${localDay(dueAt, zone)}`).toBe(`${zone} ${intended}`);
		}
	});

	it("reads the intended day from the instant, not from the clock", () => {
		expect(dueOnDayOf(new Date("2026-09-18T23:30:00.000Z")).toISOString()).toBe(
			"2026-09-18T12:00:00.000Z",
		);
		expect(dueOnDayOf(new Date("2026-09-18T00:00:00.000Z")).toISOString()).toBe(
			"2026-09-18T12:00:00.000Z",
		);
	});
});
