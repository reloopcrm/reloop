import { describe, expect, it } from "bun:test";
import { IMPORT_PROGRESS, importProgressOf } from "../lib/import-progress";

const before = "2026-09-01T00:00:00.000Z";
const floor = "2026-06-03T00:00:00.000Z";
const now = new Date("2026-09-02T00:00:00.000Z");

describe("import progress", () => {
	it("is nothing without a backfill", () => {
		expect(importProgressOf(null, now)).toBeNull();
		expect(importProgressOf(undefined, now)).toBeNull();
	});

	it("starts at zero before the first page and reads a time share afterwards", () => {
		expect(
			importProgressOf({ state: "running", before, floor, reached: null }, now),
		).toEqual({ done: false, reached: null, percent: 0 });

		const halfway = "2026-07-18T00:00:00.000Z";
		expect(
			importProgressOf(
				{ state: "running", before, floor, reached: halfway },
				now,
			),
		).toEqual({ done: false, reached: halfway, percent: 50 });
	});

	it("never says 100 while it runs and never goes below zero", () => {
		expect(
			importProgressOf({ state: "running", before, floor, reached: floor }, now)
				?.percent,
		).toBe(IMPORT_PROGRESS.runningMaxPercent);
		expect(
			importProgressOf(
				{ state: "running", before, floor, reached: "2026-09-03T00:00:00Z" },
				now,
			)?.percent,
		).toBe(0);
	});

	it("has no number when the whole mailbox is read, because there is no floor", () => {
		expect(
			importProgressOf(
				{ state: "running", before, floor: null, reached: floor },
				now,
			),
		).toEqual({ done: false, reached: floor, percent: null });
	});

	it("shows nothing for a backfill that was stopped before it read anything", () => {
		expect(
			importProgressOf(
				{ state: "done", before, floor: null, reached: null },
				now,
			),
		).toBeNull();
	});

	it("says done for a week, then goes quiet", () => {
		const done = { state: "done" as const, before, floor, reached: floor };
		expect(importProgressOf(done, now)).toEqual({
			done: true,
			reached: floor,
			percent: 100,
		});
		expect(
			importProgressOf(
				done,
				new Date(Date.parse(before) + IMPORT_PROGRESS.doneVisibleMs + 1),
			),
		).toBeNull();
	});
});
