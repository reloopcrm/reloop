import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { ResearchKeyService } from "../src/agent/research-key.service";
import { ReactivationService } from "../src/reactivation/reactivation.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "reading-progress-spec";
const rootMessageId = `thread-${suffix}@reading-progress.test`;

let login: "connected" | "idle" = "idle";
let asked = 0;

const researchKeys = {
	chatgptLogin: async () => {
		asked += 1;
		return { status: login };
	},
} as unknown as ResearchKeyService;

const service = new ReactivationService(
	db,
	{} as unknown as AgentTriggerService,
	{} as unknown as WinBackStoryPrefetchService,
	researchKeys,
);

const savedKey = process.env.OPENROUTER_API_KEY;
let threadId = "";

beforeAll(async () => {
	delete process.env.OPENROUTER_API_KEY;
	const thread = await db.emailThread.create({
		data: {
			rootMessageId,
			subject: "Reading progress",
			firstMessageAt: new Date(),
			lastMessageAt: new Date(),
			messageCount: 0,
		},
		select: { id: true },
	});
	threadId = thread.id;
});

afterAll(async () => {
	if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = savedKey;
	await db.emailThread.deleteMany({ where: { id: threadId } });
});

describe("reading progress canRead", () => {
	it("is false while no provider and no ChatGPT login exist", async () => {
		login = "idle";
		const progress = await service.progress();
		expect(progress.pending).toBeGreaterThan(0);
		expect(progress.canRead).toBe(false);
	});

	it("is true once a ChatGPT login is connected", async () => {
		login = "connected";
		const progress = await service.progress();
		expect(progress.canRead).toBe(true);
	});

	it("is true with the environment key and never asks the agent", async () => {
		process.env.OPENROUTER_API_KEY = "preview-key";
		const before = asked;
		const progress = await service.progress();
		delete process.env.OPENROUTER_API_KEY;
		expect(progress.canRead).toBe(true);
		expect(asked).toBe(before);
	});
});
