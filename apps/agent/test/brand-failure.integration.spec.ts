import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import * as websiteBrand from "../agent/lib/website-brand";

const created: string[] = [];

afterEach(async () => {
	if (created.length === 0) return;
	await db.company.deleteMany({ where: { id: { in: created.splice(0) } } });
});

const reader = spyOn(websiteBrand, "brandFromWebsite").mockImplementation(
	async () => {
		throw new Error("the page reader crashed");
	},
);

afterAll(() => {
	reader.mockRestore();
});

const { runBrand } = await import("../agent/lib/brand");

describe("a brand read that throws", () => {
	it("settles the company FAILED and passes the error on", async () => {
		const row = await db.company.create({
			data: {
				name: "Crashing Probe",
				domain: `crashing-${Date.now()}.test`,
				enrichmentStatus: EnrichmentStatus.PENDING,
			},
			select: { id: true },
		});
		created.push(row.id);

		await expect(runBrand({ companyId: row.id })).rejects.toThrow(
			"the page reader crashed",
		);

		const saved = await db.company.findUniqueOrThrow({
			where: { id: row.id },
			select: { enrichmentStatus: true, enrichmentError: true },
		});

		expect(saved.enrichmentStatus).toBe(EnrichmentStatus.FAILED);
		expect(saved.enrichmentError).toBe("the page reader crashed");
	});
});
