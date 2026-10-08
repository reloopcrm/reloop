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
import { APICallError, type LanguageModel, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { ToolContext } from "eve/tools";
import { z } from "zod";
import { focus } from "../agent/lib/focus";
import * as jev from "../agent/lib/jev";
import * as model from "../agent/lib/model";
import { inEveContext, researchCtx } from "./eve-context";

const suffix = process.env.TEST_RUN_ID ?? "website-model-failure-spec";

const PAGE = `<!doctype html><html><head>
<title>Fernhill Pallets</title>
<meta property="og:site_name" content="Fernhill Pallets">
<meta name="description" content="Pooled pallets across Europe.">
</head><body>Pooled pallets across Europe.</body></html>`;

const USAGE = {
	inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function rateLimited(): LanguageModel {
	return new MockLanguageModelV4({
		modelId: "rate-limited",
		doStream: async () => {
			throw new APICallError({
				message: "Too many requests",
				url: "https://model.example.test/v1",
				requestBodyValues: {},
				statusCode: 429,
				isRetryable: false,
			});
		},
	});
}

function erroring(): LanguageModel {
	return new MockLanguageModelV4({
		modelId: "erroring",
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "error", error: new Error("upstream overloaded") },
				],
			}),
		}),
	});
}

function answering(text: string): LanguageModel {
	return new MockLanguageModelV4({
		modelId: "answering",
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t" },
					{ type: "text-delta", id: "t", delta: text },
					{ type: "text-end", id: "t" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: "stop" },
						usage: USAGE,
					},
				],
			}),
		}),
	});
}

let reader: () => Promise<LanguageModel> = async () => rateLimited();

const spies = [
	spyOn(safeFetchModule, "safeFetch").mockImplementation(async (url) => ({
		url: new URL(url),
		response: new Response(PAGE, {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8" },
		}),
	})),
	spyOn(model, "directModel").mockImplementation((async () =>
		reader()) as unknown as typeof model.directModel),
	spyOn(jev, "typesafeKey").mockImplementation(async () => null),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const { askPage, fetchPage } = await import("../agent/lib/website-brand");
const { runBrand } = await import("../agent/lib/brand");
const researchCompany = (await import("../agent/tools/research_company"))
	.default;

const ctx = researchCtx as unknown as ToolContext;
const shape = z.object({ name: z.string() });

let ownerId: string;
const companies: string[] = [];

beforeAll(async () => {
	const owner = await db.user.create({
		data: {
			id: `owner-${suffix}`,
			name: "Rep Owner",
			email: `owner.${suffix}@example.test`,
		},
		select: { id: true },
	});
	ownerId = owner.id;
});

afterEach(async () => {
	if (companies.length === 0) return;
	const ids = companies.splice(0);
	await db.activity.deleteMany({ where: { companyId: { in: ids } } });
	await db.companyEnrichment.deleteMany({ where: { companyId: { in: ids } } });
	await db.company.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
	await db.user.deleteMany({ where: { id: ownerId } });
});

async function company() {
	const domain = `fernhill-${companies.length}-${suffix}.test`;
	const row = await db.company.create({
		data: {
			name: domain,
			domain,
			ownerId,
			enrichmentStatus: EnrichmentStatus.PENDING,
		},
		select: { id: true },
	});
	companies.push(row.id);
	return row.id;
}

async function page() {
	const read = await fetchPage(`fernhill-${suffix}.test`);
	if (!read) throw new Error("the page fixture did not load");
	return read;
}

describe("askPage", () => {
	it("calls a rate-limited model a retryable failure, not an empty answer", async () => {
		reader = async () => rateLimited();

		const answer = await askPage(await page(), shape, ["Read it."]);

		expect(answer).toMatchObject({ ok: false, retryable: true });
	});

	it("calls an error in the stream a retryable failure", async () => {
		reader = async () => erroring();

		const answer = await askPage(await page(), shape, ["Read it."]);

		expect(answer).toMatchObject({ ok: false, retryable: true });
	});

	it("says a missing model is not worth retrying", async () => {
		reader = async () => {
			throw new Error("no model provider is configured here");
		};

		const answer = await askPage(await page(), shape, ["Read it."]);

		expect(answer).toMatchObject({ ok: false, retryable: false });
	});

	it("hands back the parsed answer", async () => {
		reader = async () => answering('{"name":"Fernhill Pallets"}');

		const answer = await askPage(await page(), shape, ["Read it."]);

		expect(answer).toEqual({ ok: true, data: { name: "Fernhill Pallets" } });
	});
});

describe("a brand read whose model fails", () => {
	it("stays retryable and never marks the company complete", async () => {
		reader = async () => rateLimited();
		const id = await company();

		const result = await runBrand({ companyId: id });

		expect(result).toMatchObject({ enriched: false, retryable: true });

		const row = await db.company.findUniqueOrThrow({
			where: { id },
			select: { enrichmentStatus: true, name: true, enrichedAt: true },
		});
		expect(row.enrichmentStatus).toBe(EnrichmentStatus.FAILED);
		expect(row.enrichedAt).toBeNull();
		expect(row.name).not.toBe("Fernhill Pallets");
		expect(await db.companyEnrichment.count({ where: { companyId: id } })).toBe(
			0,
		);
	});
});

describe("research_company whose model fails", () => {
	it("says retrying can help, refunds the unit and writes nothing", async () => {
		reader = async () => rateLimited();
		const id = await company();

		await inEveContext(async () => {
			const result = await researchCompany.execute({ companyId: id }, ctx);

			expect(result).toMatchObject({ written: false, retryable: true });
			expect("reason" in result && result.reason).toContain("can help");
			expect(focus.get().spent).toBe(0);
		});

		expect(await db.activity.count({ where: { companyId: id } })).toBe(0);
	});
});

const BRIEF = (positioning: string) =>
	JSON.stringify({
		positioning,
		pricingModel: null,
		targetCustomer: null,
		notableCustomers: [],
		recentNews: [],
	});

describe("research_company keeps one brief per company", () => {
	it("replaces the brief instead of adding a second one, and skips an identical one", async () => {
		const id = await company();

		const run = async (positioning: string) => {
			reader = async () => answering(BRIEF(positioning));
			return inEveContext(() =>
				researchCompany.execute({ companyId: id }, ctx),
			);
		};

		const first = await run("Pooled pallets for European shippers.");
		expect(first).toMatchObject({ written: true, replaced: false });

		const same = await run("Pooled pallets for European shippers.");
		expect(same).toMatchObject({ written: false });

		const changed = await run("Pooled and one-way pallets across Europe.");
		expect(changed).toMatchObject({ written: true, replaced: true });

		const briefs = await db.activity.findMany({
			where: { companyId: id },
			select: { id: true, body: true, subject: true, createdById: true },
		});
		expect(briefs).toHaveLength(1);
		expect(briefs[0]?.body).toBe("Pooled and one-way pallets across Europe.");
		expect(briefs[0]?.subject).not.toMatch(/[–—]/);
		expect(briefs[0]?.createdById).toBe(ownerId);
	});
});

describe("a refreshed brief stays in the company history", () => {
	it("lists the refreshed brief even after ten newer notes", async () => {
		const id = await company();
		const run = (positioning: string) => {
			reader = async () => answering(BRIEF(positioning));
			return inEveContext(() =>
				researchCompany.execute({ companyId: id }, ctx),
			);
		};

		await run("Pooled pallets for European shippers.");

		for (let index = 0; index < 10; index += 1) {
			await db.activity.create({
				data: {
					type: "NOTE",
					subject: `Note ${index}`,
					body: "A call note.",
					occurredAt: new Date(),
					companyId: id,
					createdById: ownerId,
				},
			});
		}

		await run("Pooled and one-way pallets across Europe.");

		const { readCompanyHistory } = await import("../agent/lib/accounts");
		const history = await readCompanyHistory(id);
		const bodies = history?.notes.map((note) => note.body ?? "") ?? [];

		expect(
			bodies.some((body) =>
				body.includes("Pooled and one-way pallets across Europe."),
			),
		).toBe(true);
	});
});

describe("the author of a research note", () => {
	const plainId = `plain-${suffix}`;
	const ownerOfAllId = `workspace-owner-${suffix}`;
	let createdWorkspace = false;

	beforeAll(async () => {
		const { WORKSPACE_ID } = await import("@crm/db/workspace");
		const existing = await db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { id: true },
		});
		if (!existing) {
			await db.organization.create({
				data: {
					id: WORKSPACE_ID,
					name: "Workspace",
					slug: `workspace-${suffix}`,
					createdAt: new Date(),
				},
			});
			createdWorkspace = true;
		}

		for (const [id, role, createdAt] of [
			[plainId, "member", new Date(-86_400_000)],
			[ownerOfAllId, "owner", new Date(0)],
		] as const) {
			await db.user.create({
				data: { id, name: id, email: `${id}@example.test` },
			});
			await db.member.create({
				data: {
					id: `member-${id}`,
					organizationId: WORKSPACE_ID,
					userId: id,
					role,
					createdAt,
				},
			});
		}
	});

	afterAll(async () => {
		const { WORKSPACE_ID } = await import("@crm/db/workspace");
		await db.member.deleteMany({
			where: { userId: { in: [plainId, ownerOfAllId] } },
		});
		await db.user.deleteMany({
			where: { id: { in: [plainId, ownerOfAllId] } },
		});
		if (createdWorkspace) {
			await db.organization.deleteMany({ where: { id: WORKSPACE_ID } });
		}
	});

	it("is the record owner when there is one", async () => {
		const { researchAuthor } = await import("../agent/lib/crm");

		expect(await researchAuthor(ownerId)).toBe(ownerId);
	});

	it("is the oldest workspace owner when the record has no owner, never an older plain member", async () => {
		const { researchAuthor } = await import("../agent/lib/crm");

		expect(await researchAuthor(null)).toBe(ownerOfAllId);
		expect(await researchAuthor(null)).toBe(ownerOfAllId);
	});

	it("writes a brief on an unowned company as the oldest workspace owner", async () => {
		const id = await company();
		await db.company.update({ where: { id }, data: { ownerId: null } });
		reader = async () => answering(BRIEF("Pooled pallets for shippers."));

		await inEveContext(() => researchCompany.execute({ companyId: id }, ctx));

		const brief = await db.activity.findFirstOrThrow({
			where: { companyId: id },
			select: { createdById: true },
		});
		expect(brief.createdById).toBe(ownerOfAllId);
	});
});
