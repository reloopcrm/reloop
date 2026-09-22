import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	AGENT_TASK_THREAD_ID_KEY,
	readAgentTaskOrigin,
} from "@crm/validation/agent-task-payload";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = crypto.randomUUID();
const threadId = `lane-thread-${suffix}`;
const service = new AgentTriggerService(db);
let previousBridgeSecret: string | undefined;

beforeAll(() => {
	previousBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	delete process.env.AGENT_BRIDGE_SECRET;
});

afterAll(async () => {
	await db.agentTask.updateMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
		},
		data: {
			finishedAt: new Date(),
			outcome: "Closed by the thread lane spec.",
		},
	});
	if (previousBridgeSecret === undefined)
		delete process.env.AGENT_BRIDGE_SECRET;
	else process.env.AGENT_BRIDGE_SECRET = previousBridgeSecret;
});

async function pending() {
	return db.agentTask.findMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
		},
		select: { priority: true, payload: true, reason: true },
	});
}

describe("a stored thread carries its lane into the task", () => {
	it("queues a backfill thread at the backfill priority with its origin", async () => {
		await service.threadStored(
			threadId,
			"Old mail from the import",
			"backfill",
		);

		const rows = await pending();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.priority).toBe(PRIORITY.threadInsightBackfill);
		expect(readAgentTaskOrigin(rows[0]?.payload)).toBe("backfill");
	});

	it("lifts the waiting row when new mail lands on the same thread", async () => {
		await service.threadStored(threadId, "New email in the thread", "forward");

		const rows = await pending();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.priority).toBe(PRIORITY.threadInsight);
		expect(rows[0]?.reason).toBe("New email in the thread");
	});

	it("never lowers a fast row for a later backfill read", async () => {
		await service.threadStored(
			threadId,
			"Old mail from the import",
			"backfill",
		);

		const rows = await pending();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.priority).toBe(PRIORITY.threadInsight);
	});
});
