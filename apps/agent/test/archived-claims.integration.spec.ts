import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { COPY } from "../agent/lib/copy";
import { releaseArchivedClaims } from "../agent/lib/housekeeping";
import { say } from "../agent/lib/language";
import { researchSessionsBetween } from "../agent/lib/research-throttle";
import type { LeasedTask } from "../agent/lib/tasks";

const suffix = crypto.randomUUID();
const domain = `archived-claims-${suffix}.example.com`;
const reason = `archived-claims-${suffix}`;

async function contact(local: string, archivedAt: Date | null) {
	return db.contact.create({
		data: {
			firstName: "Preview",
			lastName: local,
			email: `${local}@${domain}`,
			archivedAt,
		},
		select: { id: true },
	});
}

async function leased(contactId: string, startedAt: Date): Promise<LeasedTask> {
	const row = await db.agentTask.create({
		data: {
			contactId,
			kind: "identify",
			reason,
			priority: PRIORITY.identify,
			budget: 4,
			dueAt: startedAt,
			startedAt,
			attempts: 1,
			leasedUntil: new Date(startedAt.getTime() + 60_000),
		},
	});

	return {
		id: row.id,
		contactId: row.contactId,
		companyId: null,
		dealId: null,
		kind: row.kind,
		reason: row.reason,
		payload: null,
		budget: row.budget,
		attempts: row.attempts,
		priority: row.priority,
		dueAt: row.dueAt,
	};
}

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
});

describe("a claimed task on an archived record", () => {
	it("closes before any model call and never counts as a session", async () => {
		const startedAt = new Date();
		const archived = await contact("archived", new Date());
		const active = await contact("active", null);
		const dropped = await leased(archived.id, startedAt);
		const kept = await leased(active.id, startedAt);
		const window = {
			since: new Date(startedAt.getTime() - 1_000),
			until: new Date(startedAt.getTime() + 1_000),
		};
		const before = await researchSessionsBetween(window.since, window.until);

		const live = await releaseArchivedClaims([dropped, kept]);

		expect(live.map((task) => task.id)).toEqual([kept.id]);

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: dropped.id },
		});
		expect(row.finishedAt).not.toBeNull();
		expect(row.startedAt).toBeNull();
		expect(row.attempts).toBe(0);
		expect(row.outcome).toBe(say(COPY.tasks.droppedArchived));

		const untouched = await db.agentTask.findUniqueOrThrow({
			where: { id: kept.id },
		});
		expect(untouched.finishedAt).toBeNull();
		expect(untouched.attempts).toBe(1);

		expect(await researchSessionsBetween(window.since, window.until)).toBe(
			before - 1,
		);
	});

	it("returns every task when nothing is archived", async () => {
		const active = await contact("still-active", null);
		const task = await leased(active.id, new Date());

		expect(await releaseArchivedClaims([task])).toEqual([task]);
	});
});
