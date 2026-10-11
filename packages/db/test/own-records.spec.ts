import { describe, expect, it } from "bun:test";
import { hasOwnRecords, type OwnRecordsDb } from "../src/sample-data";

type Where = { id: { not: { startsWith: string } } };

function table(ids: string[]) {
	return {
		findFirst: async ({ where }: { where: Where }) => {
			const id = ids.find(
				(candidate) => !candidate.startsWith(where.id.not.startsWith),
			);
			return id ? { id } : null;
		},
	};
}

function crm(rows: {
	companies?: string[];
	contacts?: string[];
	deals?: string[];
}) {
	return {
		company: table(rows.companies ?? []),
		contact: table(rows.contacts ?? []),
		deal: table(rows.deals ?? []),
	} as unknown as OwnRecordsDb;
}

describe("hasOwnRecords", () => {
	it("is false in an empty CRM", async () => {
		expect(await hasOwnRecords(crm({}))).toBe(false);
	});

	it("is false while only the sample data is there", async () => {
		expect(
			await hasOwnRecords(
				crm({
					companies: ["demo-acme"],
					contacts: ["demo-ana"],
					deals: ["demo-deal"],
				}),
			),
		).toBe(false);
	});

	it("is true for a company typed in by hand", async () => {
		expect(await hasOwnRecords(crm({ companies: ["cmp_1"] }))).toBe(true);
	});

	it("is true for a contact the intake endpoint created", async () => {
		expect(await hasOwnRecords(crm({ contacts: ["ctc_1"] }))).toBe(true);
	});

	it("is true for a deal beside the sample data", async () => {
		expect(
			await hasOwnRecords(crm({ companies: ["demo-acme"], deals: ["deal_1"] })),
		).toBe(true);
	});
});
