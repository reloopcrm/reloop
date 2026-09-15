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
import { forgetProviderCache, modelUnavailable } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";

const DAY_MS = 86_400_000;

const GATEWAY_KEYS = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"] as const;

const savedGateway = new Map<string, string>();

function hideTheGateway(): void {
	savedGateway.clear();

	for (const key of GATEWAY_KEYS) {
		const value = process.env[key];
		if (value !== undefined) savedGateway.set(key, value);
		delete process.env[key];
	}
}

function restoreTheGateway(): void {
	for (const key of GATEWAY_KEYS) {
		const value = savedGateway.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	savedGateway.clear();
}

let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;
let savedUsage: Prisma.ProviderUsageUncheckedCreateInput | null = null;

async function usage(percent: number, resetAt: Date | null) {
	await writeProviderUsage(db, {
		provider: "chatgpt",
		planType: "test",
		primaryUsedPercent: percent,
		primaryResetAt: resetAt,
		primaryWindowMinutes: 10_080,
		secondaryUsedPercent: null,
		secondaryResetAt: null,
		secondaryWindowMinutes: null,
		fasterModel: null,
	});
}

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	await db.providerUsage.deleteMany({ where: { provider: "chatgpt" } });
}

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
	savedUsage = await db.providerUsage.findUnique({
		where: { provider: "chatgpt" },
	});
});

beforeEach(async () => {
	hideTheGateway();
	forgetProviderCache();
	await clear();
	await writeAgentProvider(db, { provider: "chatgpt" });
});

afterEach(async () => {
	restoreTheGateway();
	await clear();
});

afterAll(async () => {
	await clear();
	if (savedSetting) await db.appSetting.create({ data: savedSetting });
	if (savedUsage) await db.providerUsage.create({ data: savedUsage });
});

describe("what a run is told when no model can serve it", () => {
	it("says nothing while the subscription has room", async () => {
		await usage(2, new Date(Date.now() + 7 * DAY_MS));

		expect(await modelUnavailable()).toBeNull();
	});

	it("names the limit and the day it resets", async () => {
		await usage(100, new Date(Date.now() + 3 * DAY_MS));

		const said = await modelUnavailable();

		expect(said).toContain("used up its window");
		expect(said).toContain("3 days");
	});

	it("says nothing once the window has passed", async () => {
		await usage(100, new Date(Date.now() - DAY_MS));

		expect(await modelUnavailable()).toBeNull();
	});

	it("says nothing when a second provider is set up", async () => {
		await usage(100, new Date(Date.now() + 3 * DAY_MS));
		await writeAgentProvider(db, {
			provider: "chatgpt",
			anthropicKey: sealSecret(
				"sk-ant-test",
				appSecretKey(MODEL.secrets.purpose),
			),
		});
		forgetProviderCache();

		expect(await modelUnavailable()).toBeNull();
	});
});
