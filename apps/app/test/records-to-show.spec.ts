import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const dbModule = { ...(await import("@crm/db")) };

type Rows = {
	mailboxes: number;
	sample: boolean;
	companies: string[];
	contacts: string[];
	deals: string[];
};

let rows: Rows;

function table(ids: () => string[]) {
	return {
		findFirst: async ({
			where,
		}: {
			where: { id: { not: { startsWith: string } } };
		}) => {
			const id = ids().find((candidate) => {
				return !candidate.startsWith(where.id.not.startsWith);
			});
			return id ? { id } : null;
		},
	};
}

mock.module("@crm/db", () => ({
	...dbModule,
	db: {
		mailboxSync: { count: async () => rows.mailboxes },
		company: table(() => rows.companies),
		contact: table(() => rows.contacts),
		deal: table(() => rows.deals),
	},
}));
mock.module("../lib/trpc/server", () => ({
	getServerTrpc: () => ({
		sampleData: { status: { queryOptions: () => ({ queryKey: ["s"] }) } },
	}),
	getServerQueryClient: () => ({
		fetchQuery: async () => ({ present: rows.sample }),
	}),
}));

const { hasMailboxRecords, hasRecordsToShow } = await import(
	"../lib/mailbox-connection"
);

const realDemo = process.env.RELOOP_DEMO;

beforeEach(() => {
	delete process.env.RELOOP_DEMO;
	rows = {
		mailboxes: 0,
		sample: false,
		companies: [],
		contacts: [],
		deals: [],
	};
});

afterAll(() => {
	if (realDemo === undefined) delete process.env.RELOOP_DEMO;
	else process.env.RELOOP_DEMO = realDemo;
	mock.module("@crm/db", () => dbModule);
});

describe("the overview", () => {
	it("waits for a mailbox in an empty CRM", async () => {
		expect(await hasRecordsToShow()).toBe(false);
	});

	it("shows the dashboard for companies typed in by hand", async () => {
		rows.companies = ["cmp_1"];

		expect(await hasRecordsToShow()).toBe(true);
	});

	it("shows the dashboard for a deal the intake endpoint created", async () => {
		rows.deals = ["deal_1"];

		expect(await hasRecordsToShow()).toBe(true);
	});

	it("still shows the dashboard for a connected mailbox", async () => {
		rows.mailboxes = 1;

		expect(await hasRecordsToShow()).toBe(true);
	});
});

describe("win back", () => {
	it("stays tied to the mailbox when only own records exist", async () => {
		rows.companies = ["cmp_1"];
		rows.contacts = ["ctc_1"];

		expect(await hasMailboxRecords()).toBe(false);
	});

	it("opens for the sample data", async () => {
		rows.sample = true;

		expect(await hasMailboxRecords()).toBe(true);
	});
});
