import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	meetingPrecheck,
	skippedMeetingPrep,
} from "../agent/lib/meeting-precheck";
import type { LeasedTask } from "../agent/lib/tasks";

const HOUR_MS = 3_600_000;
const suffix = crypto.randomUUID();
const reason = `meeting-precheck-${suffix}`;

async function anEvent(
	key: string,
	startsAt: Date,
	extra: { status?: string; declined?: boolean } = {},
): Promise<string> {
	const event = await db.calendarEvent.create({
		data: {
			iCalUid: `${key}-${suffix}`,
			originalStartTime: startsAt,
			startsAt,
			endsAt: new Date(startsAt.getTime() + HOUR_MS),
			status: extra.status ?? "confirmed",
			attendees: {
				create: [
					{
						email: `rep-${key}@precheck-${suffix}.example.com`,
						isSelf: true,
						responseStatus: extra.declined ? "declined" : "accepted",
					},
				],
			},
		},
		select: { id: true },
	});
	return event.id;
}

async function aLeasedTask(eventId: string | null): Promise<LeasedTask> {
	return db.agentTask.create({
		data: {
			kind: "meeting-prep",
			reason,
			priority: 200,
			budget: 10,
			attempts: 1,
			startedAt: new Date(),
			leasedUntil: new Date(Date.now() + HOUR_MS),
			dueAt: new Date(),
			payload: eventId ? { eventId } : undefined,
		},
		select: {
			id: true,
			contactId: true,
			companyId: true,
			dealId: true,
			kind: true,
			reason: true,
			payload: true,
			budget: true,
			attempts: true,
			priority: true,
			dueAt: true,
		},
	});
}

function stored(id: string) {
	return db.agentTask.findUniqueOrThrow({
		where: { id },
		select: {
			finishedAt: true,
			attempts: true,
			startedAt: true,
			outcome: true,
		},
	});
}

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: suffix } },
	});
});

describe("the meeting pre-check", () => {
	it("runs the preparation for a meeting still ahead", async () => {
		const eventId = await anEvent("ahead", new Date(Date.now() + 24 * HOUR_MS));
		const task = await aLeasedTask(eventId);

		expect(await skippedMeetingPrep(task)).toBe(false);
		expect((await stored(task.id)).finishedAt).toBeNull();
	});

	it("runs an older task that names no meeting", async () => {
		const task = await aLeasedTask(null);

		expect(await meetingPrecheck(task)).toBe("run");
	});

	it("closes the task without spending an attempt when the meeting is gone", async () => {
		const eventId = await anEvent("gone", new Date(Date.now() + 24 * HOUR_MS));
		const task = await aLeasedTask(eventId);
		await db.calendarEvent.delete({ where: { id: eventId } });

		expect(await skippedMeetingPrep(task)).toBe(true);
		const row = await stored(task.id);
		expect(row.finishedAt).not.toBeNull();
		expect(row.attempts).toBe(0);
		expect(row.startedAt).toBeNull();
		expect(row.outcome).not.toBe("");
	});

	it("closes the task when the meeting already started", async () => {
		const eventId = await anEvent("past", new Date(Date.now() - HOUR_MS));
		const task = await aLeasedTask(eventId);

		expect(await meetingPrecheck(task)).toBe("past");
		expect(await skippedMeetingPrep(task)).toBe(true);
	});

	it("closes the task when the meeting was cancelled", async () => {
		const eventId = await anEvent(
			"cancelled",
			new Date(Date.now() + 24 * HOUR_MS),
			{ status: "cancelled" },
		);

		expect(
			await meetingPrecheck({ kind: "meeting-prep", payload: { eventId } }),
		).toBe("cancelled");
	});

	it("closes the task when the rep declined the meeting", async () => {
		const eventId = await anEvent(
			"declined",
			new Date(Date.now() + 24 * HOUR_MS),
			{ declined: true },
		);

		expect(
			await meetingPrecheck({ kind: "meeting-prep", payload: { eventId } }),
		).toBe("declined");
	});

	it("leaves every other kind alone", async () => {
		expect(
			await meetingPrecheck({ kind: "identify", payload: { eventId: "x" } }),
		).toBe("run");
	});
});
