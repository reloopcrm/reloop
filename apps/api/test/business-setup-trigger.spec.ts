import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AGENT_DISPATCH } from "../src/agent/agent-dispatch.config";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";

const KIND = "business-setup";

const trigger = new AgentTriggerService(db);

async function clean() {
	await db.agentTask.deleteMany({ where: { kind: KIND } });
}

async function open() {
	return db.agentTask.count({ where: { kind: KIND, finishedAt: null } });
}

beforeEach(clean);
afterAll(clean);

describe("asking the agent what this company trades", () => {
	it("asks once and waits for the answer", async () => {
		expect(await trigger.businessSetupRequested()).toBe(true);
		expect(await trigger.businessSetupRequested()).toBe(false);
		expect(await open()).toBe(1);
	});

	it("does not ask again right after an answer", async () => {
		await trigger.businessSetupRequested();
		await db.agentTask.updateMany({
			where: { kind: KIND },
			data: { finishedAt: new Date(), outcome: "ran" },
		});

		expect(await trigger.businessSetupRequested()).toBe(false);
		expect(await open()).toBe(0);
	});

	it("asks again a day later", async () => {
		await trigger.businessSetupRequested();
		await db.agentTask.updateMany({
			where: { kind: KIND },
			data: {
				finishedAt: new Date(
					Date.now() - AGENT_DISPATCH.businessSetup.askAgainAfterMs - 60_000,
				),
				outcome: "ran",
			},
		});

		expect(await trigger.businessSetupRequested()).toBe(true);
		expect(await open()).toBe(1);
	});
});
