import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import {
	readAgentLanguage,
	summaryLanguage,
} from "@crm/validation/agent-language";
import {
	AGENT_TASK_THREAD_ID_KEY,
	readAgentTaskReread,
} from "@crm/validation/agent-task-payload";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const suffix = crypto.randomUUID();
const staleThread = `summary-stale-${suffix}`;
const freshThread = `summary-fresh-${suffix}`;
const sampleThread = `${SAMPLE_DATA.prefix}summary-${suffix}`;
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
			OR: [staleThread, freshThread, sampleThread].map((threadId) => ({
				payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
			})),
		},
		data: {
			finishedAt: new Date(),
			outcome: "Closed by the summary refresh spec.",
		},
	});
	if (previousBridgeSecret === undefined)
		delete process.env.AGENT_BRIDGE_SECRET;
	else process.env.AGENT_BRIDGE_SECRET = previousBridgeSecret;
});

function pending(threadId: string) {
	return db.agentTask.findMany({
		where: {
			kind: "thread-insight",
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
		},
		select: { payload: true },
	});
}

describe("a summary in the wrong language is read again", () => {
	it("queues a reread for a summary written before its language was tracked", async () => {
		expect(await service.summaryRefreshNeeded(staleThread, null)).toBe(true);

		const rows = await pending(staleThread);
		expect(rows).toHaveLength(1);
		expect(readAgentTaskReread(rows[0]?.payload)).toBe(true);
	});

	it("leaves a summary alone that is already in the wanted language", async () => {
		const wanted = summaryLanguage(await readAgentLanguage(db), undefined);

		expect(
			await service.summaryRefreshNeeded(freshThread, wanted, undefined),
		).toBe(false);
		expect(await pending(freshThread)).toHaveLength(0);
	});

	it("never rereads the sample data", async () => {
		expect(await service.summaryRefreshNeeded(sampleThread, null)).toBe(false);
		expect(await pending(sampleThread)).toHaveLength(0);
	});
});
