import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { DIRECT_KINDS } from "@crm/db/agent-tasks";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import { cancelSampleWork } from "../agent/lib/housekeeping";
import { claimDue, scheduleTask } from "../agent/lib/tasks";

const kind = "test-sample-guard";
const sampleId = `${SAMPLE_DATA.prefix}co-guard-spec`;
const realId = "real-company-guard-spec";
const RESEARCH = { except: DIRECT_KINDS } as const;

async function clear() {
	await db.agentTask.deleteMany({ where: { kind } });
	await db.agentTask.deleteMany({
		where: { companyId: { in: [sampleId, realId] } },
	});
	await db.company.deleteMany({ where: { id: { in: [sampleId, realId] } } });
}

async function company(id: string) {
	await db.company.create({ data: { id, name: id } });
}

async function queue(companyId: string) {
	return db.agentTask.create({
		data: {
			companyId,
			kind,
			reason: "test",
			dueAt: new Date(Date.now() - 1000),
			priority: 0,
			budget: 4,
		},
		select: { id: true },
	});
}

beforeEach(async () => {
	await clear();
	await company(sampleId);
	await company(realId);
});

afterEach(clear);

describe("the dispatch lanes and the sample data", () => {
	it("skips a sample row and still claims a real one", async () => {
		const sample = await queue(sampleId);
		const real = await queue(realId);

		const claimed = await claimDue(10, RESEARCH);
		const ids = claimed.map((task) => task.id);

		expect(ids).toContain(real.id);
		expect(ids).not.toContain(sample.id);
	});

	it("never queues work on a sample row, and still queues a real one", async () => {
		expect(
			await scheduleTask({
				companyId: sampleId,
				kind,
				reason: "test",
				dueAt: new Date(),
			}),
		).toBeNull();

		expect(
			await scheduleTask({
				companyId: realId,
				kind,
				reason: "test",
				dueAt: new Date(),
			}),
		).not.toBeNull();

		expect(await db.agentTask.count({ where: { companyId: sampleId } })).toBe(
			0,
		);
		expect(await db.agentTask.count({ where: { companyId: realId } })).toBe(1);
	});

	it("closes a task that was already queued on a sample row, and leaves a real one open", async () => {
		const sample = await queue(sampleId);
		const real = await queue(realId);

		expect(await cancelSampleWork()).toBeGreaterThan(0);

		const closed = await db.agentTask.findUnique({ where: { id: sample.id } });
		const open = await db.agentTask.findUnique({ where: { id: real.id } });

		expect(closed?.finishedAt).not.toBeNull();
		expect(closed?.outcome).toContain("sample data");
		expect(open?.finishedAt).toBeNull();
	});
});
