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
	threads?: string[];
}) {
	return {
		company: table(rows.companies ?? []),
		contact: table(rows.contacts ?? []),
		deal: table(rows.deals ?? []),
		emailThread: table(rows.threads ?? []),
	} as unknown as OwnRecordsDb;
}

const RECORDS = { mailThreads: false } as const;
const WITH_MAIL = { mailThreads: true } as const;

describe("hasOwnRecords", () => {
	it("is false in an empty CRM", async () => {
		expect(await hasOwnRecords(crm({}), RECORDS)).toBe(false);
		expect(await hasOwnRecords(crm({}), WITH_MAIL)).toBe(false);
	});

	it("is false while only the sample data is there", async () => {
		const sample = crm({
			companies: ["demo-acme"],
			contacts: ["demo-ana"],
			deals: ["demo-deal"],
			threads: ["demo-thread"],
		});

		expect(await hasOwnRecords(sample, RECORDS)).toBe(false);
		expect(await hasOwnRecords(sample, WITH_MAIL)).toBe(false);
	});

	it("is true for a company typed in by hand", async () => {
		expect(await hasOwnRecords(crm({ companies: ["cmp_1"] }), RECORDS)).toBe(
			true,
		);
	});

	it("is true for a contact the intake endpoint created", async () => {
		expect(await hasOwnRecords(crm({ contacts: ["ctc_1"] }), RECORDS)).toBe(
			true,
		);
	});

	it("is true for a deal beside the sample data", async () => {
		expect(
			await hasOwnRecords(
				crm({ companies: ["demo-acme"], deals: ["deal_1"] }),
				RECORDS,
			),
		).toBe(true);
	});

	it("leaves a mail thread out unless the caller counts mail threads", async () => {
		const mailOnly = crm({ threads: ["thr_1"] });

		expect(await hasOwnRecords(mailOnly, RECORDS)).toBe(false);
		expect(await hasOwnRecords(mailOnly, WITH_MAIL)).toBe(true);
	});

	it("never asks for mail threads when they do not count", async () => {
		const db = {
			...crm({}),
			emailThread: {
				findFirst: async () => {
					throw new Error("mail threads were read");
				},
			},
		} as unknown as OwnRecordsDb;

		expect(await hasOwnRecords(db, RECORDS)).toBe(false);
	});
});
