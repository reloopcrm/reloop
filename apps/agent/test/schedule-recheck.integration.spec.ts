import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { db } from "@crm/db";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import type { ToolContext } from "eve/tools";
import * as tasks from "../agent/lib/tasks";
import scheduleRecheck from "../agent/tools/schedule_recheck";
import { researchCtx } from "./eve-context";

const ctx = researchCtx as unknown as ToolContext;

const MISSING = "no-such-contact-recheck-spec";

const contacts: string[] = [];

afterEach(async () => {
	const ids = contacts.splice(0);
	await db.agentTask.deleteMany({
		where: { contactId: { in: [...ids, MISSING] } },
	});
	if (ids.length === 0) return;
	await db.contact.deleteMany({ where: { id: { in: ids } } });
});

async function contact(
	options: { id?: string; archived?: boolean } = {},
): Promise<string> {
	const row = await db.contact.create({
		data: {
			id: options.id,
			firstName: "Recheck",
			lastName: `Probe ${contacts.length}`,
			email: `recheck-${contacts.length}-${Date.now()}@example.com`,
			archivedAt: options.archived ? new Date() : null,
		},
		select: { id: true },
	});

	contacts.push(row.id);
	return row.id;
}

const input = (contactId: string) => ({
	contactId,
	days: 14,
	reason: "a job change here would move the Fernhill deal",
	budget: 4,
});

describe("schedule_recheck", () => {
	it("schedules a recheck on a live contact", async () => {
		const id = await contact();

		const result = await scheduleRecheck.execute(input(id), ctx);

		expect(result.scheduled).toBe(true);
		expect(
			await db.agentTask.count({
				where: { contactId: id, kind: "recheck", finishedAt: null },
			}),
		).toBe(1);
	});

	it("says there is no such contact instead of throwing", async () => {
		const result = await scheduleRecheck.execute(input(MISSING), ctx);

		expect(result).toMatchObject({
			scheduled: false,
			reason: "No such contact.",
		});
	});

	it("schedules nothing on an archived contact", async () => {
		const id = await contact({ archived: true });

		const result = await scheduleRecheck.execute(input(id), ctx);

		expect(result.scheduled).toBe(false);
		expect(await db.agentTask.count({ where: { contactId: id } })).toBe(0);
	});

	it("says a sample contact is never rechecked", async () => {
		const id = await contact({
			id: `${SAMPLE_DATA.prefix}recheck-spec-${Date.now()}`,
		});

		const result = await scheduleRecheck.execute(input(id), ctx);

		expect(result).toMatchObject({ scheduled: false });
		expect(await db.agentTask.count({ where: { contactId: id } })).toBe(0);
	});

	it("says the recheck function is off", async () => {
		const id = await contact();
		const switches = spyOn(tasks, "taskKindEnabled").mockImplementation(
			async () => false,
		);

		try {
			const result = await scheduleRecheck.execute(input(id), ctx);
			expect(result).toMatchObject({ scheduled: false });
		} finally {
			switches.mockRestore();
		}

		expect(await db.agentTask.count({ where: { contactId: id } })).toBe(0);
	});
});
