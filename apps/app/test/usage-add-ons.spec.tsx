import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { RouterOutputs } from "../lib/trpc/types";

GlobalRegistrator.register();

type Overview = RouterOutputs["billing"]["overview"];

const navigation = { ...(await import("next/navigation")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

let overview: Overview;

mock.module("next/navigation", () => ({
	...navigation,
	useRouter: () => ({ refresh: () => {} }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		billing: {
			overview: { queryOptions: () => ({ queryKey: ["billing", "overview"] }) },
			setAddOn: { mutationOptions: <T,>(options: T) => options },
			previewAddOn: {
				queryOptions: () => ({ queryKey: ["billing", "preview"] }),
			},
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: () => ({ data: overview, refetch: async () => {} }),
	useMutation: () => ({ isPending: false, mutate: () => {} }),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { UsageAddOns, addOnPrice } = await import(
	"../app/(app)/[slug]/settings/ai/usage-add-ons"
);

afterAll(() => {
	mock.restore();
	mock.module("next/navigation", () => navigation);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

const CONVERSATIONS_ADD_ON: Overview["addOnCatalog"][number] = {
	id: "conversations",
	label: "1,000 mail conversations",
	monthly: 29,
};
const DRAFTS_ADD_ON: Overview["addOnCatalog"][number] = {
	id: "drafts",
	label: "100 mail drafts",
	monthly: 19,
};
const ADD_ON_CATALOG: Overview["addOnCatalog"] = [
	CONVERSATIONS_ADD_ON,
	DRAFTS_ADD_ON,
];

const BASE_OVERVIEW: Overview = {
	configured: true,
	hosted: true,
	plan: "office",
	label: "Office",
	interval: "year",
	price: 509,
	state: "active",
	trialEndsAt: null,
	paidUntil: "2027-08-01T00:00:00.000Z",
	cancelAt: null,
	graceUntil: null,
	suspended: false,
	deleteAt: null,
	deletionDays: 30,
	addOns: { conversations: 1, drafts: 0, research: 0, mailbox: 0 },
	scheduled: {
		at: "2027-09-25T00:00:00.000Z",
		plan: "office",
		label: "Office",
		interval: "year",
		addOns: { conversations: 0, drafts: 0, research: 0, mailbox: 0 },
	},
	limits: {
		contacts: null,
		mailboxes: null,
		insightsPerMonth: null,
		draftsPerMonth: null,
		researchPerMonth: null,
		storageGb: null,
		companyResearch: true,
		aiIncluded: true,
	},
	addOnCatalog: ADD_ON_CATALOG,
	paymentMethod: null,
	address: null,
	invoices: [],
	stripeReachable: true,
};

function markupOf(data: Overview, locale: "en" | "de"): string {
	overview = data;
	return renderToStaticMarkup(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(UsageAddOns),
		}),
	);
}

function countCellOf(markup: string): string {
	const match =
		/<span[^>]*data-add-on="conversations"[^>]*>([^<]*)<\/span>/.exec(markup);
	return match?.[1] ?? "";
}

describe("the add-on stepper with a scheduled reduction", () => {
	const markup = markupOf(BASE_OVERVIEW, "de");

	it("keeps the count cell to the number only", () => {
		expect(countCellOf(markup)).toBe("1");
	});

	it("does not put the scheduled note inside the count cell", () => {
		expect(markup).not.toContain('data-add-on="conversations">1<span');
	});

	it("shows the scheduled note as its own full width line", () => {
		expect(markup).toContain('data-add-on-later="conversations"');
		expect(markup).toContain("0 ab 25. September 2027");
	});

	it("uses a fixed width class on the count cell, not a growing flex column", () => {
		expect(markup).toContain('class="w-6 text-center text-sm tabular-nums"');
	});
});

describe("the add-on price wording follows the billed interval", () => {
	it('shows the yearly total and "per year" on a yearly subscription', () => {
		const markup = markupOf(BASE_OVERVIEW, "en");
		expect(markup).toContain("348");
		expect(markup).toContain("per year");
		expect(markup).not.toContain("29 €");
	});

	it("speaks German for the yearly wording", () => {
		const markup = markupOf(BASE_OVERVIEW, "de");
		expect(markup).toContain("pro Jahr");
	});

	it('shows the monthly price and "per month" on a monthly subscription', () => {
		const monthly: Overview = { ...BASE_OVERVIEW, interval: "month" };
		const markup = markupOf(monthly, "en");
		expect(markup).toContain("29");
		expect(markup).toContain("per month");
		expect(markup).not.toContain("348");
	});
});

describe("the add-on price the confirmation dialog bills against", () => {
	it("is twelve times the monthly rate on a yearly subscription", () => {
		expect(addOnPrice(CONVERSATIONS_ADD_ON, "year")).toBe(348);
		expect(addOnPrice(DRAFTS_ADD_ON, "year")).toBe(228);
	});

	it("is the plain monthly rate on a monthly subscription", () => {
		expect(addOnPrice(CONVERSATIONS_ADD_ON, "month")).toBe(29);
		expect(addOnPrice(DRAFTS_ADD_ON, "month")).toBe(19);
	});
});
