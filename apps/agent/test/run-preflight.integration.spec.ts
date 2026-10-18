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
import { writeProviderUsage } from "@crm/db/provider-usage";
import { appSecretKey, sealSecret } from "@crm/db/secrets";
import { SETTINGS_ID, writeAgentProvider } from "@crm/db/settings";
import { pendingAgentRunIds } from "../agent/lib/custom-agent-dispatch";
import { forgetProviderCache } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";
import { MODEL_UNAVAILABLE, runBlocker } from "../agent/lib/run-preflight";
import { type FakeCodexHome, fakeCodexHome } from "./codex-home";

const DAY_MS = 86_400_000;

const OPENROUTER_KEYS = ["OPENROUTER_API_KEY"] as const;

const savedOpenrouter = new Map<string, string>();

function hideOpenrouter(): void {
	savedOpenrouter.clear();

	for (const key of OPENROUTER_KEYS) {
		const value = process.env[key];
		if (value !== undefined) savedOpenrouter.set(key, value);
		delete process.env[key];
	}
}

function restoreOpenrouter(): void {
	for (const key of OPENROUTER_KEYS) {
		const value = savedOpenrouter.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	savedOpenrouter.clear();
}

const suffix = crypto.randomUUID();
const userId = `run-preflight-user-${suffix}`;
let agentId = "";
let versionId = "";
let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;
let savedUsage: Prisma.ProviderUsageUncheckedCreateInput | null = null;
let codexHome: FakeCodexHome | null = null;

async function clearSettings() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	await db.providerUsage.deleteMany({ where: { provider: "chatgpt" } });
}

async function spendTheModelWindow() {
	await writeAgentProvider(db, { provider: "chatgpt" });
	await writeProviderUsage(db, {
		provider: "chatgpt",
		planType: "test",
		primaryUsedPercent: 100,
		primaryResetAt: new Date(Date.now() + 3 * DAY_MS),
		primaryWindowMinutes: 10_080,
		secondaryUsedPercent: null,
		secondaryResetAt: null,
		secondaryWindowMinutes: null,
		fasterModel: null,
	});
	forgetProviderCache();
}

async function offerAModel() {
	await writeAgentProvider(db, {
		provider: "openrouter",
		openrouterKey: sealSecret(
			"sk-or-test",
			appSecretKey(MODEL.secrets.purpose),
		),
	});
	forgetProviderCache();
}

async function createQueuedRun() {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "QUEUED",
			idempotencyKey: `run-preflight-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
			events: { create: { sequence: 0, type: "run.queued", data: {} } },
		},
		select: { id: true },
	});
}

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
	savedUsage = await db.providerUsage.findUnique({
		where: { provider: "chatgpt" },
	});

	await db.user.create({
		data: {
			id: userId,
			name: "Run Preflight Test",
			email: `${userId}@run-preflight-${suffix}.example.test`,
		},
	});
	const agent = await db.agentDefinition.create({
		data: { name: "Run preflight", status: "LIVE", createdById: userId },
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Summarize the run and stop.",
			manifest: {
				triggers: [
					{
						type: "MANUAL",
						name: "Run now",
						summary: "Started by hand",
						config: {},
					},
				],
				dataScope: {
					mode: "WORKSPACE",
					summary: "The whole workspace",
					resources: [],
				},
				actions: [
					{
						type: "run.summary",
						provider: "crm",
						summary: "Summarize the run",
					},
				],
			},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
			approvedAt: new Date(),
			deployedAt: new Date(),
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
});

beforeEach(async () => {
	hideOpenrouter();
	codexHome = fakeCodexHome(true);
	forgetProviderCache();
	await clearSettings();
});

afterEach(async () => {
	restoreOpenrouter();
	codexHome?.restore();
	codexHome = null;
	await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
	await db.agentAuditEvent.deleteMany({ where: { agentId } });
	await db.agentRun.deleteMany({ where: { agentId } });
	await clearSettings();
	forgetProviderCache();
});

afterAll(async () => {
	await clearSettings();
	if (savedSetting) await db.appSetting.create({ data: savedSetting });
	if (savedUsage) await db.providerUsage.create({ data: savedUsage });
	forgetProviderCache();

	if (agentId) {
		await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
		await db.agentAuditEvent.deleteMany({ where: { agentId } });
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentDefinition.updateMany({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}
	await db.user.deleteMany({ where: { id: userId } });
});

describe("a run that cannot get a model", () => {
	it("names the model as the reason before the run starts", async () => {
		await spendTheModelWindow();

		const blocked = await runBlocker(versionId);

		expect(blocked).toMatchObject({ code: MODEL_UNAVAILABLE });
		expect(blocked?.message).toContain("used up its window");
	});

	it("fails the queued run with MODEL_UNAVAILABLE instead of dispatching it", async () => {
		const run = await createQueuedRun();
		await spendTheModelWindow();

		const pending = await pendingAgentRunIds();

		expect(pending).not.toContain(run.id);
		const row = await db.agentRun.findUniqueOrThrow({ where: { id: run.id } });
		expect(row).toMatchObject({
			status: "FAILED",
			errorCode: MODEL_UNAVAILABLE,
		});
		expect(row.errorMessage).toContain("used up its window");
		expect(row.finishedAt).not.toBeNull();
	});

	it("writes one run.failed event that carries the same code", async () => {
		const run = await createQueuedRun();
		await spendTheModelWindow();

		await pendingAgentRunIds();

		const events = await db.agentRunEvent.findMany({
			where: { runId: run.id, type: "run.failed" },
			select: { data: true },
		});
		expect(events).toHaveLength(1);
		expect(events[0]?.data).toMatchObject({ code: MODEL_UNAVAILABLE });
	});
});

describe("a run on an install with no provider at all", () => {
	it("blocks with the sentence that names what to do", async () => {
		codexHome?.restore();
		codexHome = fakeCodexHome(false);
		await writeAgentProvider(db, { provider: "chatgpt" });
		forgetProviderCache();

		const blocked = await runBlocker(versionId);

		expect(blocked).toMatchObject({ code: MODEL_UNAVAILABLE });
		expect(blocked?.message).toContain("Settings, AI");
		expect(blocked?.message).not.toContain("used up its window");
	});
});

describe("a run that can get a model", () => {
	it("passes preflight and stays queued for dispatch", async () => {
		await offerAModel();

		expect(await runBlocker(versionId)).toBeNull();
	});

	it("is offered for dispatch and is not failed", async () => {
		const run = await createQueuedRun();
		await offerAModel();

		const pending = await pendingAgentRunIds();

		expect(pending).toContain(run.id);
		expect(
			await db.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
		).toMatchObject({ status: "QUEUED", errorCode: null });
		expect(
			await db.agentRunEvent.count({
				where: { runId: run.id, type: "run.failed" },
			}),
		).toBe(0);
	});
});
