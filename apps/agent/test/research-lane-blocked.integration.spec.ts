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
import { runResearchLane } from "../agent/lib/dispatch";
import { forgetProviderCache } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";

const DAY_MS = 86_400_000;
const OPENROUTER_KEYS = ["OPENROUTER_API_KEY"] as const;

const suffix = crypto.randomUUID();
const reason = `research-lane-blocked-${suffix}`;

const savedOpenrouter = new Map<string, string>();
let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;
let savedUsage: Prisma.ProviderUsageUncheckedCreateInput | null = null;
let starts = 0;

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

async function spendTheModelWindow(): Promise<void> {
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

async function offerAModel(): Promise<void> {
	await writeAgentProvider(db, {
		provider: "openrouter",
		openrouterKey: sealSecret(
			"sk-or-test",
			appSecretKey(MODEL.secrets.purpose),
		),
	});
	forgetProviderCache();
}

async function queueOne(): Promise<string> {
	const row = await db.agentTask.create({
		data: {
			companyId: null,
			kind: "company-profile",
			reason,
			priority: 40,
			budget: 1,
			dueAt: new Date(Date.now() - 1_000),
		},
		select: { id: true },
	});
	return row.id;
}

async function clean(): Promise<void> {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	await db.providerUsage.deleteMany({ where: { provider: "chatgpt" } });
}

const start = async () => {
	starts += 1;
	return { id: `session-${starts}` };
};

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
	savedUsage = await db.providerUsage.findUnique({
		where: { provider: "chatgpt" },
	});
	hideOpenrouter();
});

beforeEach(async () => {
	starts = 0;
	await clean();
});

afterEach(clean);

afterAll(async () => {
	await clean();
	restoreOpenrouter();
	forgetProviderCache();

	if (savedSetting) {
		await db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: savedSetting,
			update: savedSetting,
		});
	}
	if (savedUsage) {
		await db.providerUsage.upsert({
			where: { provider: "chatgpt" },
			create: savedUsage,
			update: savedUsage,
		});
	}
});

describe("the research lane while no model works", () => {
	it("starts no session and pushes the task into the future", async () => {
		await spendTheModelWindow();
		const id = await queueOne();

		const started = await runResearchLane(start);

		expect(started).toBe(0);
		expect(starts).toBe(0);

		const task = await db.agentTask.findUnique({
			where: { id },
			select: { dueAt: true, finishedAt: true, attempts: true },
		});

		expect(task?.finishedAt).toBeNull();
		expect(task?.dueAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
	});

	it("burns no attempt, so the task is never retired for waiting", async () => {
		await spendTheModelWindow();
		const id = await queueOne();

		await runResearchLane(start);
		const first = await db.agentTask.findUnique({
			where: { id },
			select: { attempts: true },
		});

		expect(first?.attempts).toBe(0);
	});

	it("starts the session again once a model is back", async () => {
		await offerAModel();
		await queueOne();

		const started = await runResearchLane(start);

		expect(started).toBeGreaterThan(0);
		expect(starts).toBeGreaterThan(0);
	});
});
