import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@crm/db";
import {
	readAgentProvider,
	SETTINGS_ID,
	writeAgentProvider,
} from "@crm/db/settings";

const MIGRATION = join(
	import.meta.dirname,
	"../../../packages/db/prisma/migrations/20260917120000_agent_provider_gateway_to_openrouter/migration.sql",
);

const SAVED_COLUMNS = {
	agentProvider: true,
	agentReadingModel: true,
	agentDraftModel: true,
} as const;

let saved: {
	agentProvider: string | null;
	agentReadingModel: string | null;
	agentDraftModel: string | null;
} | null = null;

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

beforeAll(async () => {
	saved = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: SAVED_COLUMNS,
	});
	await clear();
});

afterEach(clear);

afterAll(async () => {
	await clear();
	if (saved)
		await db.appSetting.create({ data: { id: SETTINGS_ID, ...saved } });
});

describe("an install that stored the gateway provider", () => {
	it("reads as OpenRouter with default mail models after the migration", async () => {
		await db.appSetting.create({
			data: {
				id: SETTINGS_ID,
				agentProvider: "gateway",
				agentReadingModel: "zai/glm-5.2-fast",
				agentDraftModel: "zai/glm-5.2-fast",
			},
		});

		await db.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));

		const row = await db.appSetting.findUniqueOrThrow({
			where: { id: SETTINGS_ID },
		});
		expect(row.agentProvider).toBe("openrouter");
		expect(row.agentReadingModel).toBeNull();
		expect(row.agentDraftModel).toBeNull();
		expect((await readAgentProvider(db)).provider).toBe("openrouter");
	});

	it("leaves a row on a current provider untouched", async () => {
		await db.appSetting.create({
			data: {
				id: SETTINGS_ID,
				agentProvider: "anthropic",
				agentReadingModel: "claude-haiku-4-5",
			},
		});

		await db.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));

		const row = await db.appSetting.findUniqueOrThrow({
			where: { id: SETTINGS_ID },
		});
		expect(row.agentProvider).toBe("anthropic");
		expect(row.agentReadingModel).toBe("claude-haiku-4-5");
	});
});

describe("switching the provider", () => {
	it("does not carry the old provider's mail models to the new one", async () => {
		await writeAgentProvider(db, {
			provider: "anthropic",
			readingModel: "claude-haiku-4-5",
			draftModel: "claude-sonnet-5",
		});

		await writeAgentProvider(db, {
			provider: "openrouter",
			readingModel: "claude-haiku-4-5",
			draftModel: "claude-sonnet-5",
		});

		expect(await readAgentProvider(db)).toMatchObject({
			provider: "openrouter",
			readingModel: null,
			draftModel: null,
		});
	});

	it("resets the mail models when the switch names none", async () => {
		await writeAgentProvider(db, {
			provider: "openrouter",
			readingModel: "openai/gpt-5.6-terra",
		});

		await writeAgentProvider(db, { provider: "chatgpt" });

		expect((await readAgentProvider(db)).readingModel).toBeNull();
	});
});
