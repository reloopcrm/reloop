import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import type { PlanPurchase } from "@crm/db/pricing";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { RouterOutputs } from "../lib/trpc/types";

type Overview = RouterOutputs["billing"]["overview"];
type PlanOption = RouterOutputs["billing"]["plans"]["plans"][number];

GlobalRegistrator.register({ url: "https://app.example.com/acme" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const started: PlanPurchase[] = [];

const sonner = { ...(await import("sonner")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };
const navigation = { ...(await import("next/navigation")) };

const option = (id: PlanOption["id"], label: string): PlanOption => ({
	id,
	label,
	monthly: 100,
	yearly: 85,
	aiIncluded: true,
	contacts: null,
	mailboxes: null,
	storageGb: null,
	over: [],
});

const plans = [option("start", "Start"), option("team", "Team")];

let overview: Overview;

mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));
mock.module("next/navigation", () => ({
	...navigation,
	useParams: () => ({ slug: "acme" }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		billing: {
			overview: { queryOptions: () => ({ queryKey: ["overview"] }) },
			plans: { queryOptions: () => ({ queryKey: ["plans"] }) },
			previewPlan: { queryOptions: () => ({ queryKey: ["preview"] }) },
			checkout: { mutationOptions: <T,>(options: T) => options },
			cancelScheduledChange: {
				mutationOptions: <T,>(options: T) => options,
			},
			cancel: { mutationOptions: <T,>(options: T) => options },
			resume: { mutationOptions: <T,>(options: T) => options },
			portal: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: ({ queryKey }: { queryKey: string[] }) => ({
		data:
			queryKey[0] === "overview"
				? overview
				: queryKey[0] === "plans"
					? { plans }
					: { effectiveAt: null, dueNow: 120, credit: 0, currency: "eur" },
		error: null,
		refetch: async () => {},
	}),
	useMutation: () => ({
		isPending: false,
		mutate: (input: PlanPurchase) => started.push(input),
	}),
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { Billing } = await import(
	"../app/(app)/[slug]/settings/billing/billing"
);

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	document.body.innerHTML = "";
	started.length = 0;
});

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("next/navigation", () => navigation);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

const base: Overview = {
	configured: true,
	hosted: true,
	plan: "start",
	label: "Start",
	interval: "month",
	price: 100,
	state: "active",
	trialEndsAt: null,
	paidUntil: "2026-11-01T00:00:00.000Z",
	cancelAt: null,
	graceUntil: null,
	suspended: false,
	deleteAt: null,
	deletionDays: 30,
	addOns: { conversations: 0, drafts: 0, research: 0, mailbox: 0 },
	scheduled: null,
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
	addOnCatalog: [],
	paymentMethod: null,
	address: null,
	taxId: null,
	invoices: [],
	stripeReachable: true,
};

async function openBilling(data: Overview, preselected: PlanPurchase | null) {
	overview = data;
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root?.render(
			createElement(I18nProvider, {
				locale: "en",
				dictionary: DICTIONARIES.en,
				children: createElement(Billing, { checkoutDone: false, preselected }),
			}),
		),
	);
	return container;
}

function checkedPlan(container: HTMLElement): string | undefined {
	return container.querySelector<HTMLInputElement>("input[name=plan]:checked")
		?.value;
}

describe("a plan chosen on the sign-up page", () => {
	it("opens the plan change for that plan and interval, without a checkout", async () => {
		const container = await openBilling(base, {
			plan: "team",
			interval: "year",
		});
		expect(checkedPlan(container)).toBe("team");
		const dialog = document.querySelector("[role=alertdialog]");
		expect(dialog?.textContent).toContain("Switch to Team?");
		expect(dialog?.textContent).toContain("billed yearly");
		expect(started).toEqual([]);
	});

	it("opens nothing without a chosen plan", async () => {
		const container = await openBilling(base, null);
		expect(checkedPlan(container)).toBeUndefined();
		expect(document.querySelector("[role=alertdialog]")).toBeNull();
	});

	it("opens no dialog when the chosen plan is the current one", async () => {
		const container = await openBilling(base, {
			plan: "start",
			interval: "month",
		});
		expect(checkedPlan(container)).toBe("start");
		expect(document.querySelector("[role=alertdialog]")).toBeNull();
	});
});
