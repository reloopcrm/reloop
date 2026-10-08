import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MeetingWhen } from "./meeting-entry";

const zone = process.env.TZ;

beforeAll(() => {
	process.env.TZ = "America/Los_Angeles";
});

afterAll(() => {
	if (zone === undefined) delete process.env.TZ;
	else process.env.TZ = zone;
});

describe("MeetingWhen", () => {
	it("shows an all day meeting on its own day west of UTC", () => {
		expect(new Date("2026-10-20T00:00:00.000Z").getDate()).toBe(19);

		const markup = renderToStaticMarkup(
			<MeetingWhen
				startsAt="2026-10-20T00:00:00.000Z"
				endsAt="2026-10-21T00:00:00.000Z"
				isAllDay
			/>,
		);

		expect(markup).toContain("Oct 20");
		expect(markup).not.toContain("Oct 19");
	});
});
