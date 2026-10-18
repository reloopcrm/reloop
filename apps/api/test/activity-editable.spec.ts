import { describe, expect, it } from "bun:test";
import { ActivityType } from "@crm/db";
import { type EditableFacts, isEditable } from "../src/activities/editable";

const rep = "user-rep";

const note: EditableFacts = {
	type: ActivityType.NOTE,
	meta: null,
	emailThreadId: null,
	calendarEventId: null,
	createdById: rep,
};

describe("an activity a rep may change", () => {
	it("is a note or a task the rep wrote", () => {
		expect(isEditable(note, rep)).toBe(true);
		expect(isEditable({ ...note, type: ActivityType.TASK }, rep)).toBe(true);
	});

	it("is never a colleague's", () => {
		expect(isEditable(note, "user-colleague")).toBe(false);
	});

	it("is never a synced mail or meeting", () => {
		expect(isEditable({ ...note, emailThreadId: "thread" }, rep)).toBe(false);
		expect(isEditable({ ...note, calendarEventId: "event" }, rep)).toBe(false);
		expect(isEditable({ ...note, type: ActivityType.EMAIL }, rep)).toBe(false);
		expect(isEditable({ ...note, type: ActivityType.MEETING }, rep)).toBe(
			false,
		);
	});

	it("is never written by the agent, a sweep or the tracker", () => {
		expect(isEditable({ ...note, meta: { source: "agent" } }, rep)).toBe(false);
		expect(isEditable({ ...note, meta: { automated: true } }, rep)).toBe(false);
	});

	it("lets the rep move the win back follow up task assigned to them", () => {
		expect(
			isEditable(
				{ ...note, type: ActivityType.TASK, meta: { winBack: true } },
				rep,
			),
		).toBe(true);
		expect(isEditable({ ...note, meta: { winBack: true } }, rep)).toBe(false);
	});

	it("is never a call, a stage change or an enrichment", () => {
		for (const type of [
			ActivityType.CALL,
			ActivityType.STAGE_CHANGE,
			ActivityType.ENRICHMENT,
		]) {
			expect(isEditable({ ...note, type }, rep)).toBe(false);
		}
	});
});
