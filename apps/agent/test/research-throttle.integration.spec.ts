import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma } from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { appSecretKey, sealSecret } from "@crm/db/secrets";
import { SETTINGS_ID, writeAgentProvider } from "@crm/db/settings";
import { forgetProviderCache } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";
import { researchAllowance } from "../agent/lib/research-throttle";

const PER_HOUR = 10;
const MINUTE_MS = 60_000;

const reason = `research-throttle-${crypto.randomUUID()}`;

let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;

type Started = {
	finishedAt?: Date | null;
	leasedUntil?: Date | null;
	outcome?: string | null;
};

async function startedTasks(count: number, shape: Started): Promise<void> {
	const now = Date.now();
	await db.agentTask.createMany({
		data: Array.from({ length: count }, () => ({
			kind: "company-profile",
			reason,
			dueAt: new Date(now - MINUTE_MS),
			startedAt: new Date(now - MINUTE_MS),
			attempts: 1,
			finishedAt: shape.finishedAt ?? null,
			leasedUntil: shape.leasedUntil ?? null,
			outcome: shape.outcome ?? null,
		})),
	});
}

async function clean(): Promise<void> {
	await db.agentTask.deleteMany({ where: { reason } });
}

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
	await writeAgentProvider(db, {
		provider: "openrouter",
		openrouterKey: sealSecret(
			"sk-or-test",
			appSecretKey(MODEL.secrets.purpose),
		),
		researchPerHour: PER_HOUR,
	});
	forgetProviderCache();
});

afterEach(clean);

afterAll(async () => {
	await clean();
	if (savedSetting) {
		await db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: savedSetting,
			update: savedSetting,
		});
	} else {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	}
	forgetProviderCache();
});

describe("the hourly research limit", () => {
	it("does not count starts that failed", async () => {
		const before = await researchAllowance(100);
		expect(before.allowed).toBeGreaterThan(2);

		await startedTasks(PER_HOUR, {
			finishedAt: new Date(),
			outcome: RETIRED_OUTCOME,
		});
		await startedTasks(PER_HOUR, {
			leasedUntil: new Date(Date.now() - MINUTE_MS),
		});
		await startedTasks(PER_HOUR, {});

		expect(await researchAllowance(100)).toEqual(before);
	});

	it("counts sessions that run or finished", async () => {
		const before = await researchAllowance(100);

		await startedTasks(1, { leasedUntil: new Date(Date.now() + MINUTE_MS) });
		await startedTasks(1, { finishedAt: new Date(), outcome: "Done." });

		expect((await researchAllowance(100)).allowed).toBe(before.allowed - 2);
	});
});
