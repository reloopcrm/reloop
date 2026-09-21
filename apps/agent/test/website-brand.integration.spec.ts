import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import * as safeFetchModule from "@crm/db/safe-fetch";
import { settle } from "../agent/lib/enrichment";
import * as model from "../agent/lib/model";

/**
 * A `brand` task with nowhere to look is consumed and marked done. What must
 * survive that is the *record*: the sign-in sweep re-queues companies whose
 * enrichment never succeeded, and it decides that on `enrichmentStatus` being
 * PENDING or FAILED.
 *
 * `runBrand` settles SKIPPED before anything marks the row RUNNING, and
 * `settle` only writes over a RUNNING row — so the row stays PENDING and the
 * sweep picks it up on the next pass. That is load bearing and entirely
 * implicit, which is why it is pinned here: a `settle` that wrote
 * unconditionally would strand every company, with nothing to say so.
 */
const created: string[] = [];
const tasks: string[] = [];

afterEach(async () => {
	if (tasks.length > 0) {
		await db.agentTask.deleteMany({ where: { id: { in: tasks.splice(0) } } });
	}
	if (created.length === 0) return;
	await db.company.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function company(status: EnrichmentStatus) {
	const row = await db.company.create({
		data: {
			name: "Keyless Probe",
			domain: `keyless-${created.length}-${status}.test`.toLowerCase(),
			enrichmentStatus: status,
		},
		select: { id: true },
	});

	created.push(row.id);
	return row.id;
}

const subjectOf = (companyId: string) => ({
	id: `keyless-${companyId}`,
	kind: "brand",
	contactId: null,
	companyId,
	dealId: null,
});

async function retiredSubjectOf(companyId: string) {
	await db.$executeRaw`
		UPDATE "company"
		SET "updatedAt" = (NOW() AT TIME ZONE 'utc') - INTERVAL '1 second'
		WHERE id = ${companyId}
	`;

	const row = await db.agentTask.create({
		data: {
			companyId,
			kind: "brand",
			reason: "keyless",
			attempts: 3,
			dueAt: new Date(),
			finishedAt: new Date(),
		},
		select: { id: true },
	});

	tasks.push(row.id);
	return { ...subjectOf(companyId), id: row.id };
}

const statusOf = async (id: string) =>
	(
		await db.company.findUnique({
			where: { id },
			select: { enrichmentStatus: true },
		})
	)?.enrichmentStatus;

describe("a brand task with no key", () => {
	it("leaves the company where the sweep will find it again", async () => {
		const id = await company(EnrichmentStatus.PENDING);

		await settle(
			subjectOf(id),
			EnrichmentStatus.SKIPPED,
			"There is no website to read.",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.PENDING);
	});

	it("does not strand a company that had already failed", async () => {
		const id = await company(EnrichmentStatus.FAILED);

		await settle(subjectOf(id), EnrichmentStatus.SKIPPED, "no key");

		expect(await statusOf(id)).toBe(EnrichmentStatus.FAILED);
	});

	it("still settles a lookup that genuinely ran", async () => {
		const id = await company(EnrichmentStatus.RUNNING);

		await settle(subjectOf(id), EnrichmentStatus.SKIPPED, "No brand.");

		expect(await statusOf(id)).toBe(EnrichmentStatus.SKIPPED);
	});

	it("records a failure on a company that never started", async () => {
		const id = await company(EnrichmentStatus.PENDING);

		await settle(
			await retiredSubjectOf(id),
			EnrichmentStatus.FAILED,
			"Research was attempted several times and never completed.",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.FAILED);
	});

	it("does not revive a company that already completed", async () => {
		const id = await company(EnrichmentStatus.COMPLETE);

		await settle(
			await retiredSubjectOf(id),
			EnrichmentStatus.FAILED,
			"too late",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.COMPLETE);
	});
});

async function domainlessCompany(status: EnrichmentStatus) {
	const row = await db.company.create({
		data: {
			name: `Keyless Probe ${created.length}`,
			enrichmentStatus: status,
		},
		select: { id: true },
	});

	created.push(row.id);
	return row.id;
}

const PAGE = `<!doctype html><html><head>
<title>Fernhill Pallets — pooled pallets across Europe</title>
<meta property="og:site_name" content="Fernhill Pallets">
<meta name="description" content="Pooled pallets and one-way pallets across Europe.">
</head><body><a href="mailto:hello@fernhill.test">hello@fernhill.test</a></body></html>`;

const served: string[] = [];

const spies = [
	spyOn(safeFetchModule, "safeFetch").mockImplementation(async (url) => {
		served.push(url);

		return {
			url: new URL(url),
			response: new Response(PAGE, {
				status: 200,
				headers: { "content-type": "text/html; charset=utf-8" },
			}),
		};
	}),
	spyOn(model, "directModel").mockImplementation(async () => {
		throw new Error("no model provider is configured here");
	}),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const { runBrand } = await import("../agent/lib/brand");

describe("a brand task on a company with no domain", () => {
	it("marks the company skipped, because no sweep will find it again", async () => {
		const id = await domainlessCompany(EnrichmentStatus.PENDING);

		const result = await runBrand({ companyId: id });

		expect(result.enriched).toBe(false);
		expect(await statusOf(id)).toBe(EnrichmentStatus.SKIPPED);
	});
});

describe("brand data comes from the company's own website, and nowhere else", () => {
	let storedKey: string | null = null;

	beforeAll(async () => {
		storedKey =
			(
				await db.appSetting.findUnique({
					where: { id: "app" },
					select: { contextDevApiKey: true },
				})
			)?.contextDevApiKey ?? null;
	});

	afterAll(async () => {
		await db.appSetting.updateMany({
			where: { id: "app" },
			data: { contextDevApiKey: storedKey },
		});
	});

	afterEach(() => {
		served.length = 0;
	});

	async function unnamedCompany() {
		const domain = `fernhill-${created.length}.test`;
		const row = await db.company.create({
			data: {
				name: domain,
				domain,
				enrichmentStatus: EnrichmentStatus.PENDING,
			},
			select: { id: true, domain: true },
		});

		created.push(row.id);
		return row;
	}

	it("reads the site even while the retired vendor key is still in the row", async () => {
		await db.appSetting.upsert({
			where: { id: "app" },
			create: { id: "app", contextDevApiKey: "ctx-a-key-nothing-reads" },
			update: { contextDevApiKey: "ctx-a-key-nothing-reads" },
		});

		const row = await unnamedCompany();

		const result = await runBrand({ companyId: row.id });

		expect(result.enriched).toBe(true);
		expect(served[0]).toBe(`https://${row.domain}/`);

		const enrichment = await db.companyEnrichment.findUniqueOrThrow({
			where: { companyId: row.id },
			select: { raw: true },
		});

		expect((enrichment.raw as { source?: string }).source).toBe("website");
		expect(await statusOf(row.id)).toBe(EnrichmentStatus.COMPLETE);
	});

	it("fills the record from what the page itself says", async () => {
		const row = await unnamedCompany();

		await runBrand({ companyId: row.id });

		const saved = await db.company.findUniqueOrThrow({
			where: { id: row.id },
			select: { name: true, email: true },
		});

		expect(saved.name).toBe("Fernhill Pallets");
		expect(saved.email).toBe("hello@fernhill.test");
	});
});
