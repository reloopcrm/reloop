import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import type { Cache } from "cache-manager";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { BackfillService } from "../src/backfill/backfill.service";
import type { ImageMirrorService } from "../src/backfill/image-mirror.service";
import type { FaviconService } from "../src/companies/favicon.service";

const suffix = crypto.randomUUID();
const domain = `backfill-active-${suffix}.example.com`;

const asked: { kind: string; ids: string[] }[] = [];

const agent = {
	backfill: async (input: {
		kind: string;
		contactIds?: string[];
		companyIds?: string[];
	}) => {
		asked.push({
			kind: input.kind,
			ids: input.contactIds ?? input.companyIds ?? [],
		});
		return { queued: 0, alreadyQueued: 0 };
	},
} as unknown as AgentTriggerService;

const favicon = { backfill: async () => false } as unknown as FaviconService;

const images = { sweep: async () => ({ copied: 0 }) } as ImageMirrorService;

const cache = {
	get: async () => undefined,
	set: async () => undefined,
} as unknown as Cache;

const backfill = new BackfillService(db, agent, favicon, images, cache);

const ids = {
	activeContact: "",
	archivedContact: "",
	activeCompany: "",
	archivedCompany: "",
};

function askedFor(kind: string): string[] {
	return asked.filter((call) => call.kind === kind).flatMap((call) => call.ids);
}

async function clear(): Promise<void> {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
}

beforeAll(async () => {
	await clear();

	const contact = (local: string, archivedAt: Date | null) =>
		db.contact.create({
			data: {
				firstName: "Preview",
				lastName: local,
				email: `${local}@${domain}`,
				githubUrl: `https://github.com/preview-${local}-${suffix}`,
				enrichmentStatus: EnrichmentStatus.PENDING,
				archivedAt,
			},
			select: { id: true },
		});
	const company = (label: string, archivedAt: Date | null) =>
		db.company.create({
			data: {
				name: `Preview ${label}`,
				domain: `${label}.${domain}`,
				enrichmentStatus: EnrichmentStatus.PENDING,
				archivedAt,
			},
			select: { id: true },
		});

	ids.activeContact = (await contact("active", null)).id;
	ids.archivedContact = (await contact("archived", new Date())).id;
	ids.activeCompany = (await company("active", null)).id;
	ids.archivedCompany = (await company("archived", new Date())).id;
});

afterAll(clear);

describe("the sign-in backfill", () => {
	it("queues research for an active contact and never for an archived one", async () => {
		await backfill.run("contacts");

		expect(askedFor("identify")).toContain(ids.activeContact);
		expect(askedFor("identify")).not.toContain(ids.archivedContact);
	});

	it("looks for a portrait of an active contact only", async () => {
		await backfill.run("contacts");

		expect(askedFor("portrait")).toContain(ids.activeContact);
		expect(askedFor("portrait")).not.toContain(ids.archivedContact);
	});

	it("books a brand look-up for an active company only", async () => {
		await backfill.run("companies");

		expect(askedFor("brand")).toContain(ids.activeCompany);
		expect(askedFor("brand")).not.toContain(ids.archivedCompany);
	});
});
