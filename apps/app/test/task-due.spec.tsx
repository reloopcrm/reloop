import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { daysUntil } = await import("../components/local-date-time");
const { MessageTime } = await import(
	"../components/crm/timeline/email-thread-entry"
);

const originalTimezone = process.env.TZ;

afterAll(() => {
	process.env.TZ = originalTimezone;
	GlobalRegistrator.unregister();
});

function localMidnight(daysFromToday: number, now: Date): string {
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + daysFromToday,
	).toISOString();
}

function timeElements(markup: string): number {
	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return holder.querySelectorAll("time").length;
}

describe("a due date counts calendar days", () => {
	const afternoon = new Date(2026, 8, 17, 15, 0);

	it("is today for the whole day", () => {
		expect(daysUntil(localMidnight(0, afternoon), afternoon)).toBe(0);
		expect(
			daysUntil(localMidnight(0, afternoon), new Date(2026, 8, 17, 23, 59)),
		).toBe(0);
	});

	it("is tomorrow, not in 9 hours", () => {
		expect(daysUntil(localMidnight(1, afternoon), afternoon)).toBe(1);
	});

	it("is in 2 days, not in 1", () => {
		expect(daysUntil(localMidnight(2, afternoon), afternoon)).toBe(2);
	});

	it("is overdue by one day only after the day ends", () => {
		expect(daysUntil(localMidnight(-1, afternoon), afternoon)).toBe(-1);
		expect(
			daysUntil(localMidnight(0, afternoon), new Date(2026, 8, 18, 0, 30)),
		).toBe(-1);
	});
});

describe("the day marker inside an opened thread", () => {
	it("compares local days east of UTC", () => {
		process.env.TZ = "Asia/Tokyo";
		const day = "2026-05-01T10:00:00.000Z";
		const lateEvening = "2026-05-01T21:30:00.000Z";
		const sameLocalDay = "2026-05-01T12:00:00.000Z";

		expect(
			timeElements(
				renderToString(createElement(MessageTime, { date: lateEvening, day })),
			),
		).toBe(2);
		expect(
			timeElements(
				renderToString(createElement(MessageTime, { date: sameLocalDay, day })),
			),
		).toBe(1);
	});
});
