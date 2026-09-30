import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma } from "@crm/db";
import { cloud } from "@crm/db/cloud/scope";
import {
	exhaustedUntilOf,
	withCallerTenant,
	withUsageCapture,
} from "../agent/lib/model";
import { actHosted, actSelfHosted, workspace } from "./hosted-cloud";

type ModelObject = ReturnType<typeof withUsageCapture>;

function spentHeaders(): Record<string, string> {
	return {
		"x-codex-primary-used-percent": "100",
		"x-codex-primary-reset-at": String(Math.floor(Date.now() / 1_000) + 3_600),
	};
}

function fakeModel(headers: Record<string, string>): ModelObject {
	const usage = {
		inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
		outputTokens: { total: 1 },
	};
	return {
		specificationVersion: "v3",
		provider: "test",
		modelId: "test",
		supportedUrls: {},
		doGenerate: async () => ({
			content: [],
			finishReason: "stop",
			usage,
			warnings: [],
			response: { headers },
		}),
		doStream: async () => ({
			stream: new ReadableStream(),
			response: { headers },
		}),
	} as never;
}

const call = (model: ModelObject) =>
	model.doGenerate({ prompt: [] } as never) as Promise<unknown>;

let savedUsage: Prisma.ProviderUsageUncheckedCreateInput | null = null;

beforeAll(async () => {
	if (!process.env.DATABASE_URL) return;
	savedUsage = await db.providerUsage
		.findUnique({ where: { provider: "chatgpt" } })
		.catch(() => null);
});

afterAll(async () => {
	actSelfHosted();
	if (!process.env.DATABASE_URL) return;
	await new Promise((settle) => setTimeout(settle, 200));
	await db.providerUsage
		.deleteMany({ where: { provider: "chatgpt" } })
		.catch(() => undefined);
	if (savedUsage) await db.providerUsage.create({ data: savedUsage });
});

describe("subscription usage on the hosted cloud", () => {
	it("records the usage for the tenant that built the model", async () => {
		actHosted();
		const tenantA = workspace("tenant-usage-a");
		const tenantB = workspace("tenant-usage-b");

		const model = cloud.run(tenantA, () =>
			withCallerTenant(withUsageCapture(fakeModel(spentHeaders()))),
		);

		await expect(call(model)).resolves.toBeDefined();
		expect(cloud.run(tenantA, () => exhaustedUntilOf("chatgpt"))).not.toBe(
			null,
		);
		expect(cloud.run(tenantB, () => exhaustedUntilOf("chatgpt"))).toBe(null);
	});

	it("never fails a finished call when there is no tenant to record for", async () => {
		actHosted();
		const model = withUsageCapture(fakeModel(spentHeaders()));

		await expect(call(model)).resolves.toBeDefined();
	});

	it("leaves a self-hosted model untouched", async () => {
		actSelfHosted();
		const inner = withUsageCapture(fakeModel({}));

		expect(withCallerTenant(inner)).toBe(inner);
		await expect(call(withCallerTenant(inner))).resolves.toBeDefined();
	});
});
