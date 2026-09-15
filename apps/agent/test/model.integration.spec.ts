import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import {
	AGENT_PROVIDER_DEFAULTS,
	DEFAULT_AGENT_MODEL,
	readAgentModel,
	readAgentProvider,
	SETTINGS_ID,
	writeAgentModel,
	writeAgentProvider,
} from "@crm/db/settings";
import {
	forgetProviderCache,
	selectedModel,
	stepModel,
} from "../agent/lib/model";

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

/**
 * The row holds the Context key a rep typed and the model they chose, and
 * DATABASE_URL is somebody's working database. Deleting it and not putting it
 * back sends them through the research-key gate again with nothing saying why.
 */
let saved: Prisma.AppSettingUncheckedCreateInput | null = null;

beforeAll(async () => {
	saved = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(async () => {
	forgetProviderCache();
	await clear();
});
afterEach(clear);

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
});

describe("the configured model", () => {
	it("falls back when nothing has ever been chosen", async () => {
		const setting = await readAgentModel(db);

		expect(setting.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(setting.isDefault).toBe(true);

		expect(await selectedModel()).toBeNull();
	});

	it("returns the chosen model with its own context window", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});

		expect(await selectedModel()).toEqual({
			model: "anthropic/claude-sonnet-5",
			modelContextWindowTokens: 200_000,
		});
	});

	it("goes back to the fallback when the choice is cleared", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		await writeAgentModel(db, null);

		expect(await selectedModel()).toBeNull();
		expect((await readAgentModel(db)).isDefault).toBe(true);
	});

	it("keeps one row rather than accumulating one per change", async () => {
		await writeAgentModel(db, { id: "openai/gpt-5.5", contextWindowTokens: 1 });
		await writeAgentModel(db, { id: "zai/glm-5.2", contextWindowTokens: 2 });

		expect(await db.appSetting.count()).toBe(1);
		expect((await readAgentModel(db)).id).toBe("zai/glm-5.2");
	});
});

describe("the model provider", () => {
	it("defaults to the gateway with the default ChatGPT model name", async () => {
		const setting = await readAgentProvider(db);

		expect(setting.provider).toBe("gateway");
		expect(setting.chatgptModel).toBe(AGENT_PROVIDER_DEFAULTS.chatgpt.model);
	});

	it("switches the agent to the ChatGPT subscription model", async () => {
		await writeAgentProvider(db, {
			provider: "chatgpt",
			chatgptModel: "gpt-5.6-mini",
		});

		expect(await readAgentProvider(db)).toMatchObject({
			provider: "chatgpt",
			chatgptModel: "gpt-5.6-mini",
		});

		forgetProviderCache();
		expect(await selectedModel()).toBeNull();

		const selection = await stepModel();
		expect(selection).not.toBeNull();
		expect(selection?.model.modelId).toBe("gpt-5.6-mini");
		expect(selection?.modelContextWindowTokens).toBe(200_000);
	});

	it("falls back to the gateway model when the provider is switched back", async () => {
		await writeAgentProvider(db, {
			provider: "chatgpt",
			chatgptModel: "gpt-5.6-mini",
		});
		await writeAgentProvider(db, { provider: "gateway", chatgptModel: "" });

		forgetProviderCache();
		const setting = await readAgentProvider(db);
		expect(setting.provider).toBe("gateway");
		expect(setting.chatgptModel).toBe(AGENT_PROVIDER_DEFAULTS.chatgpt.model);
		expect(await selectedModel()).toBeNull();
		expect(await stepModel()).toBeNull();
	});
});
