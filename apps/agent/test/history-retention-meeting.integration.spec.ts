import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { MEETING_PREP_KIND } from "@crm/db/agent-tasks";
import { pruneAgentHistory } from "../agent/lib/housekeeping";

const HOUR_MS = 3_600_000;
const suffix = crypto.randomUUID();
const reason = `history-retention-${suffix}`;
const now = new Date("2001-01-10T12:00:00.000Z");
const finishedAt = new Date("2000-06-01T12:00:00.000Z");

async function anEvent(key: string, startsAt: Date): Promise<string> {
	const event = await db.calendarEvent.create({
		data: {
			iCalUid: `${key}-${suffix}`,
			originalStartTime: startsAt,
			startsAt,
			endsAt: new Date(startsAt.getTime() + HOUR_MS),
			status: "confirmed",
		},
		select: { id: true },
	});
	return event.id;
}

async function aFinishedTask(
	kind: string,
	eventId: string | null,
): Promise<string> {
	const task = await db.agentTask.create({
		data: {
			kind,
			reason,
			priority: 200,
			budget: 10,
			dueAt: finishedAt,
			finishedAt,
			payload: eventId ? { eventId } : undefined,
		},
		select: { id: true },
	});
	return task.id;
}

async function kept(id: string): Promise<boolean> {
	return (await db.agentTask.count({ where: { id } })) === 1;
}

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: suffix } },
	});
});

describe("history retention and meeting preparation", () => {
	it("keeps a finished preparation while its meeting is still ahead", async () => {
		const ahead = await anEvent(
			"ahead",
			new Date(now.getTime() + 48 * HOUR_MS),
		);
		const past = await anEvent("past", new Date(now.getTime() - 48 * HOUR_MS));
		const forAhead = await aFinishedTask(MEETING_PREP_KIND, ahead);
		const forPast = await aFinishedTask(MEETING_PREP_KIND, past);
		const forGone = await aFinishedTask(MEETING_PREP_KIND, `gone-${suffix}`);
		const other = await aFinishedTask("identify", ahead);

		await pruneAgentHistory(now, 1);

		expect(await kept(forAhead)).toBe(true);
		expect(await kept(forPast)).toBe(false);
		expect(await kept(forGone)).toBe(false);
		expect(await kept(other)).toBe(false);
	});
});
