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
import { appSecretKey, sealSecret } from "@crm/db/secrets";
import {
	AGENT_PROVIDER_DEFAULTS,
	chatModelFor,
	readAgentProvider,
	SETTINGS_ID,
	writeAgentProvider,
} from "@crm/db/settings";
import { forgetProviderCache, stepModel } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";

const sealed = (key: string) =>
	sealSecret(key, appSecretKey(MODEL.secrets.purpose));

let savedOpenrouterKey: string | undefined;

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
	savedOpenrouterKey = process.env.OPENROUTER_API_KEY;
	delete process.env.OPENROUTER_API_KEY;
	forgetProviderCache();
	await clear();
});
afterEach(async () => {
	if (savedOpenrouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = savedOpenrouterKey;
	await clear();
});

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
});

describe("the OpenRouter model", () => {
	it("falls back to the default when nothing has ever been chosen", async () => {
		const setting = await readAgentProvider(db);

		expect(setting.openrouterModel).toBe(
			AGENT_PROVIDER_DEFAULTS.openrouter.model,
		);
		expect(chatModelFor(setting)).toEqual({
			id: AGENT_PROVIDER_DEFAULTS.openrouter.model,
			contextWindowTokens:
				AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
		});
	});

	it("returns the chosen model", async () => {
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterModel: "anthropic/claude-sonnet-5",
		});

		expect(chatModelFor(await readAgentProvider(db)).id).toBe(
			"anthropic/claude-sonnet-5",
		);
	});

	it("goes back to the default when the choice is cleared", async () => {
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterModel: "anthropic/claude-sonnet-5",
		});
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterModel: "",
		});

		expect((await readAgentProvider(db)).openrouterModel).toBe(
			AGENT_PROVIDER_DEFAULTS.openrouter.model,
		);
	});

	it("keeps one row rather than accumulating one per change", async () => {
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterModel: "openai/gpt-5.5",
		});
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterModel: "z-ai/glm-5.3-flash",
		});

		expect(await db.appSetting.count()).toBe(1);
		expect((await readAgentProvider(db)).openrouterModel).toBe(
			"z-ai/glm-5.3-flash",
		);
	});

	it("builds the OpenRouter model for a step once a key is stored", async () => {
		await writeAgentProvider(db, {
			provider: "openrouter",
			openrouterKey: sealed("sk-or-test"),
		});

		forgetProviderCache();
		const selection = await stepModel();
		expect(selection?.model.modelId).toBe(
			AGENT_PROVIDER_DEFAULTS.openrouter.model,
		);
		expect(selection?.model.provider).toBe("openrouter.chat");
		expect(selection?.modelContextWindowTokens).toBe(
			AGENT_PROVIDER_DEFAULTS.openrouter.contextWindowTokens,
		);
	});
});

describe("the model provider", () => {
	it("defaults to OpenRouter with the default ChatGPT model name", async () => {
		const setting = await readAgentProvider(db);

		expect(setting.provider).toBe("openrouter");
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
		const selection = await stepModel();
		expect(selection).not.toBeNull();
		expect(selection?.model.modelId).toBe("gpt-5.6-mini");
		expect(selection?.modelContextWindowTokens).toBe(200_000);
	});

	it("keeps ChatGPT as the only candidate when OpenRouter has no key", async () => {
		await writeAgentProvider(db, {
			provider: "chatgpt",
			chatgptModel: "gpt-5.6-mini",
		});
		await writeAgentProvider(db, { provider: "openrouter", chatgptModel: "" });

		forgetProviderCache();
		const setting = await readAgentProvider(db);
		expect(setting.provider).toBe("openrouter");
		expect(setting.chatgptModel).toBe(AGENT_PROVIDER_DEFAULTS.chatgpt.model);
		const selection = await stepModel();
		expect(selection?.model.modelId).toBe(
			AGENT_PROVIDER_DEFAULTS.chatgpt.model,
		);
	});
});
