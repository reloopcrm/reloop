import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { ChatgptLoginStatus } from "@crm/validation/chatgpt-login";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { ResearchKeyService } from "../src/agent/research-key.service";
import { ReactivationService } from "../src/reactivation/reactivation.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "reading-progress-spec";
const rootMessageId = `thread-${suffix}@reading-progress.test`;

let login: ChatgptLoginStatus = "idle";
let loginStored = false;
let asked = 0;

const researchKeys = {
	chatgptLogin: async () => {
		asked += 1;
		return { status: login, loginStored };
	},
} as unknown as ResearchKeyService;

function build(): ReactivationService {
	return new ReactivationService(
		db,
		{} as unknown as AgentTriggerService,
		{} as unknown as WinBackStoryPrefetchService,
		researchKeys,
	);
}

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
		const progress = await build().progress();
		expect(progress.pending).toBeGreaterThan(0);
		expect(progress.canRead).toBe(false);
	});

	it("is true once a ChatGPT login is connected", async () => {
		login = "connected";
		const progress = await build().progress();
		expect(progress.canRead).toBe(true);
	});

	it("stays true when the agent cannot report the login", async () => {
		login = "unavailable";
		const progress = await build().progress();
		expect(progress.canRead).toBe(true);
	});

	it("stays true after a cancelled ChatGPT re-login", async () => {
		login = "cancelled";
		loginStored = true;
		const progress = await build().progress();
		loginStored = false;
		expect(progress.canRead).toBe(true);
	});

	it("stays true while a ChatGPT re-login waits for the code", async () => {
		login = "waiting";
		loginStored = true;
		const progress = await build().progress();
		loginStored = false;
		expect(progress.canRead).toBe(true);
	});

	it("is false after a cancelled first ChatGPT login", async () => {
		login = "cancelled";
		const progress = await build().progress();
		expect(progress.canRead).toBe(false);
	});

	it("is false while a first ChatGPT login waits for the code", async () => {
		login = "waiting";
		const progress = await build().progress();
		expect(progress.canRead).toBe(false);
	});

	it("asks the agent once a minute at most", async () => {
		login = "idle";
		const service = build();
		const before = asked;
		await service.progress();
		await service.progress();
		expect(asked - before).toBe(1);
	});

	it("is true with the environment key and never asks the agent", async () => {
		process.env.OPENROUTER_API_KEY = "preview-key";
		const before = asked;
		const progress = await build().progress();
		delete process.env.OPENROUTER_API_KEY;
		expect(progress.canRead).toBe(true);
		expect(asked).toBe(before);
	});
});
