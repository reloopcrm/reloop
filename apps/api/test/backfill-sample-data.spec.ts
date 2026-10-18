import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import type { Cache } from "cache-manager";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { BackfillService } from "../src/backfill/backfill.service";
import type { ImageMirrorService } from "../src/backfill/image-mirror.service";
import type { FaviconService } from "../src/companies/favicon.service";

const suffix = process.env.TEST_RUN_ID ?? "backfill-sample-spec";
const domain = `backfill-${suffix}.example.com`;
const realId = `real-${suffix}`;
const sampleId = `demo-${suffix}`;

const asked: { kind: string; companyIds: string[] }[] = [];
const faviconsAsked: string[] = [];

const agent = {
	backfill: async (input: { kind: string; companyIds?: string[] }) => {
		asked.push({ kind: input.kind, companyIds: input.companyIds ?? [] });
		return { queued: 0, alreadyQueued: 0 };
	},
} as unknown as AgentTriggerService;

const favicon = {
	backfill: async (companyId: string) => {
		faviconsAsked.push(companyId);
		return false;
	},
} as unknown as FaviconService;

const images = { sweep: async () => ({ copied: 0 }) } as ImageMirrorService;

const cache = {
	get: async () => undefined,
	set: async () => undefined,
} as unknown as Cache;

const backfill = new BackfillService(db, agent, favicon, images, cache);

async function clear(): Promise<void> {
	await db.company.deleteMany({ where: { id: { in: [realId, sampleId] } } });
}

beforeAll(async () => {
	await clear();

	for (const id of [realId, sampleId]) {
		await db.company.create({
			data: {
				id,
				name: id,
				domain: `${id}.${domain}`,
				enrichmentStatus: EnrichmentStatus.PENDING,
			},
		});
	}
});

afterAll(clear);

describe("the backfill sweep", () => {
	it("never spends a slot on a sample company", async () => {
		await backfill.run("companies");

		const companyIds = asked.flatMap((call) => call.companyIds);

		expect(companyIds).toContain(realId);
		expect(companyIds).not.toContain(sampleId);
		expect(faviconsAsked).not.toContain(sampleId);
	});
});
