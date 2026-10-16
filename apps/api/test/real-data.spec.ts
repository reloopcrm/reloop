import { describe, expect, it } from "bun:test";
import { hasRealData } from "../src/demo/demo-data";

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
	threads?: string[];
}) {
	return {
		company: table(rows.companies ?? []),
		contact: table(rows.contacts ?? []),
		deal: table(rows.deals ?? []),
		emailThread: table(rows.threads ?? []),
	} as unknown as Parameters<typeof hasRealData>[0];
}

describe("hasRealData", () => {
	it("is false in an empty CRM and beside the sample data only", async () => {
		expect(await hasRealData(crm({}))).toBe(false);
		expect(
			await hasRealData(
				crm({
					companies: ["demo-acme"],
					contacts: ["demo-ana"],
					deals: ["demo-deal"],
					threads: ["demo-thread"],
				}),
			),
		).toBe(false);
	});

	it("is true for a company, a contact or a deal of the workspace", async () => {
		expect(await hasRealData(crm({ companies: ["cmp_1"] }))).toBe(true);
		expect(await hasRealData(crm({ contacts: ["ctc_1"] }))).toBe(true);
		expect(await hasRealData(crm({ deals: ["deal_1"] }))).toBe(true);
	});

	it("counts a mail thread of the workspace as its own data", async () => {
		expect(await hasRealData(crm({ threads: ["thr_1"] }))).toBe(true);
	});
});
