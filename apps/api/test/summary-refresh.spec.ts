import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { readMonthlyUsage } from "@crm/db/plan-usage";
import { SAMPLE_DATA } from "@crm/db/sample-data";
import {
	readAgentLanguage,
	summaryLanguage,
} from "@crm/validation/agent-language";
import { AGENT_TASK_THREAD_ID_KEY } from "@crm/validation/agent-task-payload";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const REFRESH_KIND = "thread-refresh";
const suffix = crypto.randomUUID();
const staleThread = `summary-stale-${suffix}`;
const freshThread = `summary-fresh-${suffix}`;
const sampleThread = `${SAMPLE_DATA.prefix}summary-${suffix}`;
const bulkThread = `summary-bulk-${suffix}`;
const threads = [staleThread, freshThread, sampleThread, bulkThread];
const service = new AgentTriggerService(db);
let previousBridgeSecret: string | undefined;

beforeAll(() => {
	previousBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	delete process.env.AGENT_BRIDGE_SECRET;
});

afterAll(async () => {
	await db.agentTask.updateMany({
		where: {
			kind: { in: [REFRESH_KIND, "thread-insight"] },
			finishedAt: null,
			OR: threads.map((threadId) => ({
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
			finishedAt: null,
			payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
		},
		select: { kind: true, priority: true },
	});
}

describe("a summary in the wrong language is refreshed", () => {
	it("queues a refresh, not a new reading, when a rep opens the thread", async () => {
		expect(await service.summaryRefreshNeeded(staleThread, null)).toBe(true);

		expect(await pending(staleThread)).toEqual([
			{ kind: REFRESH_KIND, priority: PRIORITY.threadRefresh },
		]);
	});

	it("does not raise the monthly reading counter", async () => {
		const before = await readMonthlyUsage(db);
		await service.summaryRefreshRequested(`${staleThread}-count`, "forward");
		await service.summaryRefreshRequested(`${bulkThread}-count`, "backfill");
		const after = await readMonthlyUsage(db);

		expect(after.insights).toBe(before.insights);

		await db.agentTask.updateMany({
			where: {
				kind: REFRESH_KIND,
				finishedAt: null,
				OR: [`${staleThread}-count`, `${bulkThread}-count`].map((threadId) => ({
					payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
				})),
			},
			data: { finishedAt: new Date(), outcome: "Closed by the spec." },
		});
	});

	it("queues the bulk run at the backfill priority and lifts it when a rep opens the thread", async () => {
		await service.summaryRefreshRequested(bulkThread, "backfill");
		expect(await pending(bulkThread)).toEqual([
			{ kind: REFRESH_KIND, priority: PRIORITY.threadInsightBackfill },
		]);

		await service.summaryRefreshNeeded(bulkThread, null);
		expect(await pending(bulkThread)).toEqual([
			{ kind: REFRESH_KIND, priority: PRIORITY.threadRefresh },
		]);
	});

	it("leaves a summary alone that is already in the wanted language", async () => {
		const wanted = summaryLanguage(await readAgentLanguage(db), undefined);

		expect(
			await service.summaryRefreshNeeded(freshThread, wanted, undefined),
		).toBe(false);
		expect(await pending(freshThread)).toHaveLength(0);
	});

	it("never refreshes the sample data", async () => {
		expect(await service.summaryRefreshNeeded(sampleThread, null)).toBe(false);
		expect(await pending(sampleThread)).toHaveLength(0);
	});
});
