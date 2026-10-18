import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { STORY_KIND } from "@crm/db/plans";
import { BACKFILL_PRIORITY } from "../agent/lib/dispatch";
import { DISPATCH } from "../agent/lib/dispatch-config";
import { claimDue } from "../agent/lib/tasks";

const reason = "story-prefetch-order spec";

async function clear() {
	await db.agentTask.deleteMany({ where: { reason } });
}

beforeEach(clear);
afterEach(clear);

async function story(priority: number, dueAt: Date) {
	return db.agentTask.create({
		data: { kind: STORY_KIND, reason, priority, budget: 1, dueAt },
		select: { id: true },
	});
}

function fastLane(limit: number) {
	return claimDue(limit, { only: [STORY_KIND] }, DISPATCH.insight.leaseMs, {
		above: BACKFILL_PRIORITY,
	});
}

describe("a story the rep opened", () => {
	it("is claimed before a prefetched story that waited longer", async () => {
		const prefetched = await story(
			PRIORITY.storyPrefetch,
			new Date(Date.now() - 60_000),
		);
		const opened = await story(
			PRIORITY.personStory,
			new Date(Date.now() - 1_000),
		);

		const [first] = await fastLane(1);
		expect(first?.id).toBe(opened.id);

		const [second] = await fastLane(1);
		expect(second?.id).toBe(prefetched.id);
	});

	it("leaves a prefetched story in the fast lane, ahead of the mail backfill", () => {
		expect(PRIORITY.storyPrefetch).toBeGreaterThan(BACKFILL_PRIORITY);
		expect(PRIORITY.storyPrefetch).toBeLessThan(PRIORITY.threadInsight);
		expect(PRIORITY.storyPrefetch).toBeLessThan(PRIORITY.personStory);
	});
});
